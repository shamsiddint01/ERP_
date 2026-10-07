import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { RecordSalaryPaymentDto } from './dto/record-salary-payment.dto.js';

/** The center works in Tashkent time (UTC+5, no DST) — a salary month is a Tashkent calendar month. */
const TASHKENT_OFFSET = '+05:00';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "2026-10" → [2026-10-01 00:00 Tashkent, 2026-11-01 00:00 Tashkent). */
export function periodRange(period: string): { start: Date; end: Date } {
  const [year, month] = period.split('-').map(Number);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  return { start: new Date(`${period}-01T00:00:00${TASHKENT_OFFSET}`), end: new Date(`${next}-01T00:00:00${TASHKENT_OFFSET}`) };
}

/** The current month in Tashkent time, as "YYYY-MM". */
export function currentPeriod(now = new Date()): string {
  const tashkent = new Date(now.getTime() + 5 * 3_600_000);
  return `${tashkent.getUTCFullYear()}-${String(tashkent.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The `count` months ending with `period`, newest first. */
function previousPeriods(period: string, count: number): string[] {
  const [year, month] = period.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/**
 * Teacher salary = TeacherProfile.salaryPercent % of the tuition collected in
 * the month from the students of the teacher's groups. "Collected" means
 * money actually allocated to a tuition charge of that group from a COMPLETED
 * payment received that month — a refunded payment drops out, and a payment
 * not yet allocated to any charge doesn't count for anyone yet. Payouts are
 * recorded per month (partial payouts allowed, never more than earned).
 */
@Injectable()
export class SalariesService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('TeacherSalaryPayment', (id) => this.prisma.teacherSalaryPayment.findUnique({ where: { id } }));
  }

  /** Collected tuition per (teacher, group) for the month. */
  private async collected(period: string, teacherEmployeeId?: string) {
    const { start, end } = periodRange(period);
    const allocations = await this.prisma.tuitionAllocation.findMany({
      where: {
        payment: { status: 'COMPLETED', paidAt: { gte: start, lt: end } },
        tuitionCharge: { enrollment: { group: teacherEmployeeId ? { teacherEmployeeId } : { teacherEmployeeId: { not: null } } } },
      },
      select: { amount: true, tuitionCharge: { select: { enrollment: { select: { group: { select: { id: true, name: true, teacherEmployeeId: true } } } } } } },
    });
    const byTeacher = new Map<string, Map<string, { groupId: string; groupName: string; collected: number }>>();
    for (const a of allocations) {
      const group = a.tuitionCharge.enrollment.group;
      const teacherId = group.teacherEmployeeId!;
      const groups = byTeacher.get(teacherId) ?? new Map();
      const row = groups.get(group.id) ?? { groupId: group.id, groupName: group.name, collected: 0 };
      row.collected = round2(row.collected + Number(a.amount));
      groups.set(group.id, row);
      byTeacher.set(teacherId, groups);
    }
    return byTeacher;
  }

  private async paid(period: string, teacherEmployeeId?: string) {
    const rows = await this.prisma.teacherSalaryPayment.groupBy({ by: ['teacherEmployeeId'], where: { period, teacherEmployeeId }, _sum: { amount: true } });
    return new Map(rows.map((r) => [r.teacherEmployeeId, Number(r._sum.amount ?? 0)]));
  }

  private summarize(percent: number | null, groups: { collected: number }[], paid: number) {
    const collected = round2(groups.reduce((sum, g) => sum + g.collected, 0));
    const earned = percent === null ? 0 : round2((collected * percent) / 100);
    return { percent, collected, earned, paid: round2(paid), remaining: round2(Math.max(earned - paid, 0)) };
  }

  /** Every teacher (active ones, plus any inactive one with money in that month) for the admin's salary sheet. */
  async overview(period = currentPeriod()) {
    const [profiles, collected, paid] = await Promise.all([
      this.prisma.teacherProfile.findMany({ include: { employee: { select: { id: true, fullName: true, employeeCode: true } } }, orderBy: { employee: { fullName: 'asc' } } }),
      this.collected(period),
      this.paid(period),
    ]);
    const items = profiles
      .filter((p) => p.status === 'ACTIVE' || collected.has(p.employeeId) || paid.has(p.employeeId))
      .map((p) => {
        const groups = [...(collected.get(p.employeeId)?.values() ?? [])];
        return {
          teacherProfileId: p.id,
          teacherEmployeeId: p.employeeId,
          fullName: p.employee.fullName,
          employeeCode: p.employee.employeeCode,
          groups,
          ...this.summarize(p.salaryPercent === null ? null : Number(p.salaryPercent), groups, paid.get(p.employeeId) ?? 0),
        };
      });
    const totals = items.reduce((t, i) => ({ collected: t.collected + i.collected, earned: t.earned + i.earned, paid: t.paid + i.paid, remaining: t.remaining + i.remaining }), { collected: 0, earned: 0, paid: 0, remaining: 0 });
    return { period, items, totals: { collected: round2(totals.collected), earned: round2(totals.earned), paid: round2(totals.paid), remaining: round2(totals.remaining) } };
  }

  /** One teacher's month in detail (per-group breakdown + payouts) and a 6-month history. */
  async forTeacher(teacherEmployeeId: string, period = currentPeriod()) {
    const profile = await this.prisma.teacherProfile.findUnique({ where: { employeeId: teacherEmployeeId }, include: { employee: { select: { fullName: true } } } });
    if (!profile) throw new NotFoundException('Teacher not found');
    const percent = profile.salaryPercent === null ? null : Number(profile.salaryPercent);

    const months = previousPeriods(period, 6);
    const history = await Promise.all(
      months.map(async (p) => {
        const [collected, paid] = await Promise.all([this.collected(p, teacherEmployeeId), this.paid(p, teacherEmployeeId)]);
        const groups = [...(collected.get(teacherEmployeeId)?.values() ?? [])];
        return { period: p, groups, ...this.summarize(percent, groups, paid.get(teacherEmployeeId) ?? 0) };
      }),
    );
    const payments = await this.prisma.teacherSalaryPayment.findMany({
      where: { teacherEmployeeId, period },
      select: { id: true, amount: true, paidAt: true, note: true, recordedBy: { select: { fullName: true } } },
      orderBy: { paidAt: 'desc' },
    });
    return { teacherEmployeeId, fullName: profile.employee.fullName, ...history[0], payments, history };
  }

  /** The caller's own salary — only for a user linked to a teacher. */
  async mine(userId: string, period?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employee: { select: { id: true, teacherProfile: { select: { id: true } } } } } });
    if (!user?.employee?.teacherProfile) throw new ForbiddenException("Bu bo'lim faqat ustozlar uchun");
    return this.forTeacher(user.employee.id, period);
  }

  async recordPayment(dto: RecordSalaryPaymentDto, actorUserId: string) {
    const month = await this.forTeacher(dto.teacherEmployeeId, dto.period);
    if (dto.amount > month.remaining + 0.001) {
      throw new BadRequestException(`To'lov qolgan summadan (${month.remaining}) oshib ketdi`);
    }
    return this.prisma.teacherSalaryPayment.create({
      data: { teacherEmployeeId: dto.teacherEmployeeId, period: dto.period, amount: dto.amount, note: dto.note, recordedByUserId: actorUserId },
    });
  }

  async deletePayment(id: string) {
    const payment = await this.prisma.teacherSalaryPayment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Salary payment not found');
    await this.prisma.teacherSalaryPayment.delete({ where: { id } });
    return payment;
  }
}
