import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Payroll, Prisma, SalaryType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  computeBaseAmount,
  computeOvertimeAmount,
  countStandardWorkingDays,
  round2,
  summarizeAttendance,
  type TeacherCompensationInput,
} from '../../shared/payroll/payroll-calculation.util.js';

type TransactionClient = Prisma.TransactionClient;

function sumLinesByType(lines: Array<{ type: string; amount: Prisma.Decimal }>, type: string): number {
  return round2(lines.filter((l) => l.type === type).reduce((sum, l) => sum + Number(l.amount), 0));
}

/** The three Phase H salary types that need TeacherProfile rates + real lesson/group counts instead of AttendanceRecord. */
const TEACHER_SALARY_TYPES: ReadonlySet<SalaryType> = new Set(['PER_LESSON', 'PER_GROUP', 'MIXED']);

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

    // Phase H: PER_LESSON/PER_GROUP/MIXED are driven by real Lesson/StudentGroup
    // rows instead of AttendanceRecord — resolved here (DB access), then
    // handed to the still-pure computeBaseAmount.
    const teacherInput = TEACHER_SALARY_TYPES.has(compensation.salaryType)
      ? await this.resolveTeacherCompensationInput(tx, payroll.employeeId, compensation.salaryType, payroll.period.periodStart, payroll.period.periodEnd)
      : null;

    const baseAmount = computeBaseAmount(compensationInput, standardWorkingDays, summary, teacherInput);
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

  /**
   * Resolves the real, period-scoped figures PER_LESSON/PER_GROUP/MIXED
   * compensation is computed from: the TeacherProfile's own rates, how many
   * of this teacher's lessons were actually COMPLETED in the period
   * (CANCELLED lessons are excluded by this query, never paid for), and how
   * many of their groups are currently ACTIVE and overlap the period at all
   * ("valid active groups", per spec). Throws rather than silently paying 0
   * when the employee has no TeacherProfile at all, or is missing the
   * specific rate(s) their salaryType requires — a misconfigured rate should
   * block calculation, not quietly understate pay.
   */
  private async resolveTeacherCompensationInput(
    tx: TransactionClient,
    employeeId: string,
    salaryType: SalaryType,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<TeacherCompensationInput> {
    const profile = await tx.teacherProfile.findUnique({ where: { employeeId } });
    if (!profile) {
      throw new BadRequestException(`This employee has no TeacherProfile — cannot use ${salaryType} compensation`);
    }

    const perLessonRate = profile.perLessonRate !== null ? Number(profile.perLessonRate) : null;
    const perGroupRate = profile.perGroupRate !== null ? Number(profile.perGroupRate) : null;

    if (salaryType === 'PER_LESSON' && perLessonRate === null) {
      throw new BadRequestException('This teacher has no perLessonRate set on their TeacherProfile');
    }
    if (salaryType === 'PER_GROUP' && perGroupRate === null) {
      throw new BadRequestException('This teacher has no perGroupRate set on their TeacherProfile');
    }
    if (salaryType === 'MIXED' && perLessonRate === null && perGroupRate === null) {
      throw new BadRequestException('MIXED compensation requires at least one of perLessonRate/perGroupRate to be set on the TeacherProfile');
    }

    const [completedLessons, activeGroups] = await Promise.all([
      tx.lesson.count({
        where: { teacherEmployeeId: employeeId, status: 'COMPLETED', scheduledStart: { gte: periodStart, lte: periodEnd } },
      }),
      tx.studentGroup.count({
        where: {
          teacherEmployeeId: employeeId,
          status: 'ACTIVE',
          startDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
      }),
    ]);

    return { perLessonRate, perGroupRate, completedLessons, activeGroups };
  }
}
