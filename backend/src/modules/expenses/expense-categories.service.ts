import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { CreateExpenseCategoryDto } from './dto/create-expense-category.dto.js';
import type { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto.js';

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('ExpenseCategory', (id) => this.prisma.expenseCategory.findUnique({ where: { id } }));
  }

  findAll() {
    return this.prisma.expenseCategory.findMany({
      orderBy: { name: 'asc' },
      include: { account: { select: { id: true, code: true, name: true } }, _count: { select: { expenses: true } } },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id },
      include: { account: { select: { id: true, code: true, name: true } } },
    });
    if (!category) throw new NotFoundException('Expense category not found');
    return category;
  }

  async create(dto: CreateExpenseCategoryDto) {
    const existing = await this.prisma.expenseCategory.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Expense category "${dto.name}" already exists`);
    if (dto.accountId) await this.assertAccountIsExpenseLeaf(dto.accountId);
    return this.prisma.expenseCategory.create({ data: { name: dto.name, accountId: dto.accountId } });
  }

  async update(id: string, dto: UpdateExpenseCategoryDto) {
    await this.findOne(id);
    if (dto.accountId) await this.assertAccountIsExpenseLeaf(dto.accountId);
    return this.prisma.expenseCategory.update({ where: { id }, data: { name: dto.name, accountId: dto.accountId } });
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    if (category.isSystem) throw new ConflictException(`"${category.name}" is a system category and cannot be removed`);
    const expenseCount = await this.prisma.expense.count({ where: { categoryId: id } });
    if (expenseCount > 0) throw new ConflictException('Cannot remove a category that already has expenses recorded against it');
    return this.prisma.expenseCategory.delete({ where: { id } });
  }

  private async assertAccountIsExpenseLeaf(accountId: string): Promise<void> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.category !== 'EXPENSE') throw new ConflictException(`Account "${account.name}" is not an EXPENSE-category account`);
    if (!account.isPostable) throw new ConflictException(`Account "${account.name}" is a header account and cannot receive postings`);
  }
}
