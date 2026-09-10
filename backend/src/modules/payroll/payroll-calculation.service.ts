import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Payroll, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  computeBaseAmount,
  computeOvertimeAmount,
  countStandardWorkingDays,
  round2,
  summarizeAttendance,
} from '../../shared/payroll/payroll-calculation.util.js';

type TransactionClient = Prisma.TransactionClient;

function sumLinesByType(lines: Array<{ type: string; amount: Prisma.Decimal }>, type: string): number {
  return round2(lines.filter((l) => l.type === type).reduce((sum, l) => sum + Number(l.amount), 0));
}

/**
 * The isolated, testable payroll math engine. Deterministic and reproducible:
 * given the same compensation + attendance rows, calculate() always yields
 * the same amounts. Only ever touches BASE/OVERTIME lines (attendance-
 * derived) — manually-added BONUS/ALLOWANCE/DEDUCTION lines are left alone,
 * so recalculating never discards a manager's deliberate additions.
 */
@Injectable()
export class PayrollCalculationService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(payrollId: string, tx?: TransactionClient): Promise<Payroll> {
    if (!tx) return this.prisma.$transaction((trx) => this.calculate(payrollId, trx));

    const payroll = await tx.payroll.findUnique({ where: { id: payrollId }, include: { period: true, employee: true } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (!['DRAFT', 'CALCULATED'].includes(payroll.status)) {
      throw new ConflictException(`Only DRAFT or CALCULATED payrolls can be (re)calculated (current: ${payroll.status})`);
    }
    if (payroll.employee.deletedAt) {
      throw new BadRequestException('Cannot calculate payroll for a terminated employee');
    }
    if (payroll.employee.hireDate > payroll.period.periodEnd) {
      throw new BadRequestException(`${payroll.employee.fullName} was not yet hired during this period`);
    }

    const compensation = await tx.employeeCompensation.findFirst({
      where: {
        employeeId: payroll.employeeId,
        effectiveFrom: { lte: payroll.period.periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: payroll.period.periodEnd } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!compensation) {
      throw new BadRequestException(`No compensation record found for ${payroll.employee.fullName} covering this period`);
    }

    const attendanceRecords = await tx.attendanceRecord.findMany({
      where: { employeeId: payroll.employeeId, workDate: { gte: payroll.period.periodStart, lte: payroll.period.periodEnd } },
    });
    const summary = summarizeAttendance(attendanceRecords);
    const standardWorkingDays = countStandardWorkingDays(payroll.period.periodStart, payroll.period.periodEnd);

    const compensationInput = { baseSalary: Number(compensation.baseSalary), salaryType: compensation.salaryType, overtimeRate: compensation.overtimeRate ? Number(compensation.overtimeRate) : null };
    const baseAmount = computeBaseAmount(compensationInput, standardWorkingDays, summary);
    const overtimeAmount = computeOvertimeAmount(compensationInput, summary.overtimeMinutes);

    // Machine-generated lines are fully replaced on every (re)calculation — idempotent and reproducible.
    // Manually-added BONUS/ALLOWANCE/DEDUCTION lines are untouched.
    await tx.payrollLine.deleteMany({ where: { payrollId, type: { in: ['BASE', 'OVERTIME'] } } });
    await tx.payrollLine.create({ data: { payrollId, type: 'BASE', label: 'Base salary', amount: baseAmount } });
    if (overtimeAmount > 0) {
      await tx.payrollLine.create({ data: { payrollId, type: 'OVERTIME', label: 'Overtime', amount: overtimeAmount } });
    }

    const allLines = await tx.payrollLine.findMany({ where: { payrollId } });
    const bonusAmount = sumLinesByType(allLines, 'BONUS');
    const allowanceAmount = sumLinesByType(allLines, 'ALLOWANCE');
    const deductionAmount = sumLinesByType(allLines, 'DEDUCTION');
    const grossSalary = round2(baseAmount + overtimeAmount + bonusAmount + allowanceAmount);
    const netSalary = round2(grossSalary - deductionAmount);

    if (netSalary < 0) {
      throw new BadRequestException('Deductions exceed gross salary — review this payroll’s lines before recalculating');
    }

    return tx.payroll.update({
      where: { id: payrollId },
      data: {
        compensationId: compensation.id,
        workedDays: summary.workedDays,
        workedMinutes: summary.workedMinutes,
        overtimeMinutes: summary.overtimeMinutes,
        unpaidAbsenceDays: summary.unpaidAbsenceDays,
        baseAmount,
        overtimeAmount,
        bonusAmount,
        allowanceAmount,
        deductionAmount,
        grossSalary,
        netSalary,
        status: 'CALCULATED',
        calculatedAt: new Date(),
      },
    });
  }
}
