import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { FinanceLedgerService } from '../../shared/finance/finance-ledger.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { generateDocumentNumber } from '../../shared/utils/document-number.util.js';
import type { CreateExpenseDto } from './dto/create-expense.dto.js';
import type { QueryExpenseDto } from './dto/query-expense.dto.js';
import type { UpdateExpenseDto } from './dto/update-expense.dto.js';

const EXPENSE_INCLUDE = {
  category: { include: { account: { select: { id: true, code: true, name: true } } } },
  vendorSupplier: { select: { id: true, companyName: true } },
  responsibleEmployee: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true, username: true } },
  createdBy: { select: { id: true, fullName: true, username: true } },
  paymentAccount: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ExpenseInclude;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeLedger: FinanceLedgerService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Expense', (id) => this.prisma.expense.findUnique({ where: { id } }));
  }

  async findAll(query: QueryExpenseDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ExpenseWhereInput = {
      status: query.status,
      categoryId: query.categoryId,
      vendorSupplierId: query.vendorSupplierId,
      ...(query.search && { expenseNumber: { contains: query.search, mode: 'insensitive' } }),
      ...((query.from || query.to) && {
        expenseDate: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: EXPENSE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id }, include: EXPENSE_INCLUDE });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async create(dto: CreateExpenseDto, userId: string) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Expense category not found');

    const expenseNumber = await generateDocumentNumber('EXP', () => this.prisma.expense.count());
    return this.prisma.expense.create({
      data: {
        expenseNumber,
        categoryId: dto.categoryId,
        amount: dto.amount,
        expenseDate: new Date(dto.expenseDate),
        description: dto.description,
        vendorSupplierId: dto.vendorSupplierId,
        responsibleEmployeeId: dto.responsibleEmployeeId,
        paymentMethod: dto.paymentMethod,
        receiptAttachmentUrl: dto.receiptAttachmentUrl,
        createdByUserId: userId,
      },
      include: EXPENSE_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateExpenseDto) {
    const expense = await this.findOne(id);
    if (expense.status !== 'DRAFT') throw new ConflictException('Only DRAFT expenses can be edited');
    if (dto.categoryId) {
      const category = await this.prisma.expenseCategory.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Expense category not found');
    }

    return this.prisma.expense.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        amount: dto.amount,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
        description: dto.description,
        vendorSupplierId: dto.vendorSupplierId,
        responsibleEmployeeId: dto.responsibleEmployeeId,
        paymentMethod: dto.paymentMethod,
        receiptAttachmentUrl: dto.receiptAttachmentUrl,
      },
      include: EXPENSE_INCLUDE,
    });
  }

  /** DRAFT -> PENDING: sends the expense for manager approval. */
  async submit(id: string) {
    const expense = await this.findOne(id);
    if (expense.status !== 'DRAFT') throw new ConflictException(`Only DRAFT expenses can be submitted (current: ${expense.status})`);
    return this.prisma.expense.update({ where: { id }, data: { status: 'PENDING' }, include: EXPENSE_INCLUDE });
  }

  /** PENDING -> APPROVED: recognizes the liability (Dr Expense account / Cr Accounts Payable). Cash is not touched yet. */
  async approve(id: string, userId: string) {
    const expense = await this.findOne(id);
    if (expense.status !== 'PENDING') throw new ConflictException(`Only PENDING expenses can be approved (current: ${expense.status})`);
    if (!expense.category.accountId) {
      throw new BadRequestException(`Expense category "${expense.category.name}" has no linked Chart of Accounts expense account`);
    }

    return this.prisma.$transaction(async (tx) => {
      await this.financeLedger.recordExpenseApproval(
        {
          amount: Number(expense.amount),
          expenseId: expense.id,
          expenseNumber: expense.expenseNumber,
          expenseAccountId: expense.category.accountId!,
          createdByUserId: userId,
        },
        tx,
      );
      return tx.expense.update({
        where: { id },
        data: { status: 'APPROVED', approvedByUserId: userId, approvedAt: new Date() },
        include: EXPENSE_INCLUDE,
      });
    });
  }

  /** PENDING -> REJECTED: no financial impact, nothing was ever posted. */
  async reject(id: string, userId: string) {
    const expense = await this.findOne(id);
    if (expense.status !== 'PENDING') throw new ConflictException(`Only PENDING expenses can be rejected (current: ${expense.status})`);
    return this.prisma.expense.update({
      where: { id },
      data: { status: 'REJECTED', approvedByUserId: userId, approvedAt: new Date() },
      include: EXPENSE_INCLUDE,
    });
  }

  /** APPROVED -> PAID: clears the payable — Dr Accounts Payable / Cr Cash/Bank, chosen by the expense's paymentMethod. */
  async pay(id: string, userId: string) {
    const expense = await this.findOne(id);
    if (expense.status !== 'APPROVED') throw new ConflictException(`Only APPROVED expenses can be paid (current: ${expense.status})`);

    return this.prisma.$transaction(async (tx) => {
      const paymentAccount = await this.financeLedger.resolveCashOrBankAccount(expense.paymentMethod, tx);
      await this.financeLedger.recordExpensePayment(
        {
          amount: Number(expense.amount),
          method: expense.paymentMethod,
          expenseId: expense.id,
          expenseNumber: expense.expenseNumber,
          createdByUserId: userId,
        },
        tx,
      );
      return tx.expense.update({
        where: { id },
        data: { status: 'PAID', paidAt: new Date(), paymentAccountId: paymentAccount.id },
        include: EXPENSE_INCLUDE,
      });
    });
  }

  /** Cancellable from DRAFT/PENDING (no reversal needed) or APPROVED (reverses the posted liability first). */
  async cancel(id: string, userId: string) {
    const expense = await this.findOne(id);
    if (!['DRAFT', 'PENDING', 'APPROVED'].includes(expense.status)) {
      throw new ConflictException(`Cannot cancel a ${expense.status} expense`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (expense.status === 'APPROVED') {
        if (!expense.category.accountId) throw new BadRequestException('Expense category has no linked account to reverse');
        await this.financeLedger.recordExpenseApprovalReversal(
          {
            amount: Number(expense.amount),
            expenseId: expense.id,
            expenseNumber: expense.expenseNumber,
            expenseAccountId: expense.category.accountId,
            createdByUserId: userId,
          },
          tx,
        );
      }
      return tx.expense.update({ where: { id }, data: { status: 'CANCELLED' }, include: EXPENSE_INCLUDE });
    });
  }
}
