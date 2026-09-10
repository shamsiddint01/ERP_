import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { FinanceLedgerService } from '../../shared/finance/finance-ledger.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { generateDocumentNumber } from '../../shared/utils/document-number.util.js';
import type { AddPayrollLineDto } from './dto/add-payroll-line.dto.js';
import type { CancelPayrollDto } from './dto/cancel-payroll.dto.js';
import type { GeneratePayrollDto } from './dto/generate-payroll.dto.js';
import type { PayPayrollDto } from './dto/pay-payroll.dto.js';
import type { QueryPayrollDto } from './dto/query-payroll.dto.js';
import { PayrollCalculationService } from './payroll-calculation.service.js';

const PAYROLL_LIST_INCLUDE = {
  period: { select: { id: true, name: true, periodStart: true, periodEnd: true } },
  employee: { select: { id: true, employeeCode: true, fullName: true, department: { select: { id: true, name: true } } } },
} satisfies Prisma.PayrollInclude;

const PAYROLL_DETAIL_INCLUDE = {
  ...PAYROLL_LIST_INCLUDE,
  compensation: { select: { id: true, baseSalary: true, salaryType: true, overtimeRate: true } },
  lines: { include: { component: { select: { id: true, name: true, type: true } } }, orderBy: { createdAt: 'asc' } },
  approvedBy: { select: { id: true, fullName: true, username: true } },
  createdBy: { select: { id: true, fullName: true, username: true } },
  paymentAccount: { select: { id: true, code: true, name: true } },
} satisfies Prisma.PayrollInclude;

const ACTIONABLE_LINE_TYPES = ['BONUS', 'ALLOWANCE', 'DEDUCTION'] as const;

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculationService: PayrollCalculationService,
    private readonly financeLedger: FinanceLedgerService,
    private readonly notifications: NotificationsService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Payroll', (id) => this.prisma.payroll.findUnique({ where: { id } }));
  }

  async findAll(query: QueryPayrollDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PayrollWhereInput = {
      periodId: query.periodId,
      employeeId: query.employeeId,
      status: query.status,
      ...(query.departmentId && { employee: { departmentId: query.departmentId } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.payroll.findMany({
        where,
        include: PAYROLL_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payroll.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id }, include: PAYROLL_DETAIL_INCLUDE });
    if (!payroll) throw new NotFoundException('Payroll not found');
    return payroll;
  }

  /** Real aggregate KPIs for a period — used by the frontend's period-level Payroll dashboard. */
  async getPeriodSummary(periodId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException('Payroll period not found');

    const [statusCounts, totals] = await Promise.all([
      this.prisma.payroll.groupBy({ by: ['status'], where: { periodId }, _count: true }),
      this.prisma.payroll.aggregate({
        where: { periodId },
        _sum: { grossSalary: true, deductionAmount: true, netSalary: true },
        _count: true,
      }),
    ]);

    const countFor = (status: string) => statusCounts.find((s) => s.status === status)?._count ?? 0;

    return {
      period,
      employeeCount: totals._count,
      grossTotal: Number(totals._sum.grossSalary ?? 0),
      deductionsTotal: Number(totals._sum.deductionAmount ?? 0),
      netTotal: Number(totals._sum.netSalary ?? 0),
      draftCount: countFor('DRAFT'),
      calculatedCount: countFor('CALCULATED'),
      approvedCount: countFor('APPROVED'),
      paidCount: countFor('PAID'),
      cancelledCount: countFor('CANCELLED'),
    };
  }

  async create(periodId: string, employeeId: string, userId: string) {
    const period = await this.assertPeriodOpen(periodId);
    await this.assertEmployeeUsable(employeeId, period.periodEnd);

    try {
      const payrollNumber = await generateDocumentNumber('PYR', () => this.prisma.payroll.count());
      return await this.prisma.payroll.create({
        data: { payrollNumber, periodId, employeeId, createdByUserId: userId },
        include: PAYROLL_DETAIL_INCLUDE,
      });
    } catch (error) {
      throw this.translateDuplicatePayrollError(error);
    }
  }

  /** Bulk-creates DRAFT payroll rows for every requested (or every active) employee who doesn't already have one this period. */
  async generate(dto: GeneratePayrollDto, userId: string) {
    const period = await this.assertPeriodOpen(dto.periodId);

    const employees = dto.employeeIds?.length
      ? await this.prisma.employee.findMany({ where: { id: { in: dto.employeeIds } } })
      : await this.prisma.employee.findMany({ where: { deletedAt: null, status: { not: 'TERMINATED' } } });

    const existing = await this.prisma.payroll.findMany({ where: { periodId: dto.periodId }, select: { employeeId: true } });
    const existingIds = new Set(existing.map((p) => p.employeeId));

    let created = 0;
    let skipped = 0;
    for (const employee of employees) {
      if (existingIds.has(employee.id) || employee.deletedAt || employee.hireDate > period.periodEnd) {
        skipped += 1;
        continue;
      }
      const payrollNumber = await generateDocumentNumber('PYR', () => this.prisma.payroll.count());
      await this.prisma.payroll.create({ data: { payrollNumber, periodId: dto.periodId, employeeId: employee.id, createdByUserId: userId } });
      created += 1;
    }

    return { periodId: dto.periodId, created, skipped };
  }

  async addLine(payrollId: string, dto: AddPayrollLineDto) {
    const payroll = await this.findOne(payrollId);
    if (!['DRAFT', 'CALCULATED'].includes(payroll.status)) {
      throw new ConflictException(`Cannot add a line to a ${payroll.status} payroll`);
    }
    if (dto.componentId) {
      const component = await this.prisma.payrollComponent.findUnique({ where: { id: dto.componentId } });
      if (!component) throw new NotFoundException('Payroll component not found');
      if (component.type !== dto.type) throw new BadRequestException(`Component "${component.name}" is not a ${dto.type} component`);
    }

    await this.prisma.payrollLine.create({
      data: { payrollId, type: dto.type, componentId: dto.componentId, label: dto.label, amount: dto.amount, notes: dto.notes },
    });

    // Keep aggregates fresh if this payroll was already calculated — never leave stale totals on the Payroll row.
    if (payroll.status === 'CALCULATED') {
      await this.calculationService.calculate(payrollId);
    }
    return this.findOne(payrollId);
  }

  async removeLine(payrollId: string, lineId: string) {
    const payroll = await this.findOne(payrollId);
    if (!['DRAFT', 'CALCULATED'].includes(payroll.status)) {
      throw new ConflictException(`Cannot remove a line from a ${payroll.status} payroll`);
    }
    const line = payroll.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('Payroll line not found');
    if (!(ACTIONABLE_LINE_TYPES as readonly string[]).includes(line.type)) {
      throw new BadRequestException('BASE/OVERTIME lines are calculated automatically and cannot be removed directly — recalculate instead');
    }

    await this.prisma.payrollLine.delete({ where: { id: lineId } });
    if (payroll.status === 'CALCULATED') {
      await this.calculationService.calculate(payrollId);
    }
    return this.findOne(payrollId);
  }

  /** Runs (or re-runs) the calculation engine — see PayrollCalculationService for the actual math. */
  async calculate(id: string) {
    await this.calculationService.calculate(id);
    const payroll = await this.findOne(id);

    // Best-effort: notify approvers that a payroll is now CALCULATED and
    // awaiting sign-off. dedupe on (recipient, type, payrollId) keeps a
    // re-calculation from spamming a fresh alert each time.
    if (payroll.status === 'CALCULATED') {
      try {
        await this.notifications.notifyByPermission('payroll', 'APPROVE', {
          type: 'PAYROLL_PENDING',
          title: 'Tasdiqlashni kutayotgan ish haqi',
          message: `${payroll.payrollNumber} — ${payroll.employee.fullName}, sof ${Number(payroll.netSalary).toLocaleString('en-US', { minimumFractionDigits: 2 })} tasdiqlashni kutmoqda.`,
          referenceType: 'Payroll',
          referenceId: payroll.id,
          actionUrl: '/payroll',
        });
      } catch (error) {
        this.logger.error(`Failed to send PAYROLL_PENDING notification for ${id}: ${(error as Error).message}`);
      }
    }

    return payroll;
  }

  /** CALCULATED -> APPROVED: recognizes the payroll cost in the ledger (Dr Salary Expense / Cr Payroll Payable [+ Cr Deductions Payable]). */
  async approve(id: string, userId: string) {
    const payroll = await this.findOne(id);
    if (payroll.status !== 'CALCULATED') {
      throw new ConflictException(`Only CALCULATED payrolls can be approved (current: ${payroll.status})`);
    }

    return this.prisma.$transaction(async (tx) => {
      const entry = await this.financeLedger.recordPayrollApproval(
        {
          grossSalary: Number(payroll.grossSalary),
          netSalary: Number(payroll.netSalary),
          deductionAmount: Number(payroll.deductionAmount),
          payrollId: payroll.id,
          payrollNumber: payroll.payrollNumber,
          createdByUserId: userId,
        },
        tx,
      );
      const updateResult = await tx.payroll.updateMany({
        where: { id, status: payroll.status },
        data: { status: 'APPROVED', approvedByUserId: userId, approvedAt: new Date(), approvalJournalEntryId: entry.id },
      });
      if (updateResult.count === 0) {
        throw new ConflictException('Payroll status was changed concurrently — please retry');
      }
      return tx.payroll.findUniqueOrThrow({ where: { id }, include: PAYROLL_DETAIL_INCLUDE });
    });
  }

  /** APPROVED -> PAID: clears the payable — Dr Payroll Payable / Cr Cash-or-Bank (chosen by the given payment method). */
  async pay(id: string, dto: PayPayrollDto, userId: string) {
    const payroll = await this.findOne(id);
    if (payroll.status !== 'APPROVED') {
      throw new ConflictException(`Only APPROVED payrolls can be paid (current: ${payroll.status})`);
    }

    return this.prisma.$transaction(async (tx) => {
      const paymentAccount = await this.financeLedger.resolveCashOrBankAccount(dto.method, tx);
      const entry = await this.financeLedger.recordPayrollPayment(
        { netSalary: Number(payroll.netSalary), method: dto.method, payrollId: payroll.id, payrollNumber: payroll.payrollNumber, createdByUserId: userId },
        tx,
      );
      const updateResult = await tx.payroll.updateMany({
        where: { id, status: payroll.status },
        data: { status: 'PAID', paidAt: new Date(), paymentAccountId: paymentAccount.id, paymentJournalEntryId: entry.id },
      });
      if (updateResult.count === 0) {
        throw new ConflictException('Payroll status was changed concurrently — please retry');
      }
      return tx.payroll.findUniqueOrThrow({ where: { id }, include: PAYROLL_DETAIL_INCLUDE });
    });
  }

  /** Cancellable from DRAFT/CALCULATED (no reversal needed) or APPROVED (reverses the posted journal entry first). Never cancellable once PAID. */
  async cancel(id: string, dto: CancelPayrollDto, userId: string) {
    const payroll = await this.findOne(id);
    if (!['DRAFT', 'CALCULATED', 'APPROVED'].includes(payroll.status)) {
      throw new ConflictException(`Cannot cancel a ${payroll.status} payroll`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (payroll.status === 'APPROVED') {
        await this.financeLedger.recordPayrollApprovalReversal(
          {
            grossSalary: Number(payroll.grossSalary),
            netSalary: Number(payroll.netSalary),
            deductionAmount: Number(payroll.deductionAmount),
            payrollId: payroll.id,
            payrollNumber: payroll.payrollNumber,
            createdByUserId: userId,
          },
          tx,
        );
      }
      const updateResult = await tx.payroll.updateMany({
        where: { id, status: payroll.status },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: dto.reason },
      });
      if (updateResult.count === 0) {
        throw new ConflictException('Payroll status was changed concurrently — please retry');
      }
      return tx.payroll.findUniqueOrThrow({ where: { id }, include: PAYROLL_DETAIL_INCLUDE });
    });
  }

  private async assertPeriodOpen(periodId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException('Payroll period not found');
    if (period.status !== 'OPEN') throw new ConflictException('Cannot create payroll rows against a CLOSED period');
    return period;
  }

  private async assertEmployeeUsable(employeeId: string, periodEnd: Date): Promise<void> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.deletedAt) throw new NotFoundException('Employee not found');
    if (employee.hireDate > periodEnd) throw new BadRequestException(`${employee.fullName} was not yet hired during this period`);
  }

  private translateDuplicatePayrollError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('A payroll row already exists for this employee in this period');
    }
    return error;
  }
}
