import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { TuitionReportQueryDto } from './dto/tuition-report-query.dto.js';

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** End-of-day boundary so a `to` date includes everything posted on that calendar day. */
function endOfDay(date: string): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Phase G — Tuition reports. Every figure here is a fresh aggregation over
  // TuitionCharge/TuitionAllocation (never a cached counter), matching
  // StudentFinanceService's own "always computed live" rule.
  // ---------------------------------------------------------------------------

  /** Gross/discount/net tuition billed, bucketed by billingPeriod. Excludes CANCELLED charges — a cancelled charge was never really billed. */
  async tuitionBilled(query: TuitionReportQueryDto) {
    const charges = await this.prisma.tuitionCharge.findMany({
      where: { status: { not: 'CANCELLED' }, billingPeriod: { gte: query.billingPeriodFrom, lte: query.billingPeriodTo } },
      select: { billingPeriod: true, amount: true, discountAmount: true, netAmount: true },
    });

    const byPeriod = new Map<string, { count: number; amount: number; discount: number; net: number }>();
    for (const charge of charges) {
      const row = byPeriod.get(charge.billingPeriod) ?? { count: 0, amount: 0, discount: 0, net: 0 };
      row.count += 1;
      row.amount += toNumber(charge.amount);
      row.discount += toNumber(charge.discountAmount);
      row.net += toNumber(charge.netAmount);
      byPeriod.set(charge.billingPeriod, row);
    }

    const rows = [...byPeriod.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([billingPeriod, sums]) => ({
        billingPeriod,
        count: sums.count,
        amount: round2(sums.amount),
        discountAmount: round2(sums.discount),
        netAmount: round2(sums.net),
      }));

    return { rows, totalBilled: round2(rows.reduce((sum, r) => sum + r.netAmount, 0)) };
  }

  /** Money actually collected (allocated), bucketed by the billingPeriod of the charge it was applied to — not by when the charge itself was raised. */
  async tuitionCollected(query: TuitionReportQueryDto) {
    const allocations = await this.prisma.tuitionAllocation.findMany({
      where: {
        createdAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? endOfDay(query.to) : undefined,
        },
      },
      select: { amount: true, tuitionCharge: { select: { billingPeriod: true } } },
    });

    const byPeriod = new Map<string, number>();
    for (const allocation of allocations) {
      const period = allocation.tuitionCharge.billingPeriod;
      byPeriod.set(period, (byPeriod.get(period) ?? 0) + toNumber(allocation.amount));
    }

    const rows = [...byPeriod.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([billingPeriod, totalCollected]) => ({ billingPeriod, totalCollected: round2(totalCollected) }));

    return { rows, totalCollected: round2(allocations.reduce((sum, a) => sum + toNumber(a.amount), 0)), count: allocations.length };
  }

  /** Every non-cancelled charge with a positive outstanding balance right now (netAmount − allocated), regardless of its stored status. */
  async tuitionOutstanding(query: TuitionReportQueryDto) {
    const charges = await this.prisma.tuitionCharge.findMany({
      where: { status: { not: 'CANCELLED' }, billingPeriod: { gte: query.billingPeriodFrom, lte: query.billingPeriodTo } },
      include: { student: { select: { studentCode: true, fullName: true } }, allocations: { select: { amount: true } } },
      orderBy: { dueDate: 'asc' },
    });

    const rows = charges
      .map((charge) => {
        const allocated = charge.allocations.reduce((sum, a) => sum + toNumber(a.amount), 0);
        return {
          chargeId: charge.id,
          studentCode: charge.student.studentCode,
          studentName: charge.student.fullName,
          billingPeriod: charge.billingPeriod,
          dueDate: charge.dueDate,
          netAmount: toNumber(charge.netAmount),
          allocated: round2(allocated),
          outstanding: round2(toNumber(charge.netAmount) - allocated),
        };
      })
      .filter((row) => row.outstanding > 0);

    return { rows, totalOutstanding: round2(rows.reduce((sum, r) => sum + r.outstanding, 0)), count: rows.length };
  }

  /** Outstanding charges whose dueDate has already passed — the same live rule StudentFinanceService.getBalance uses for its own `overdue` figure, never the stored status column. */
  async tuitionOverdue(query: TuitionReportQueryDto) {
    const { rows: outstandingRows } = await this.tuitionOutstanding(query);
    const now = new Date();
    const rows = outstandingRows.filter((row) => row.dueDate.getTime() < now.getTime());
    return { rows, totalOverdue: round2(rows.reduce((sum, r) => sum + r.outstanding, 0)), count: rows.length };
  }

  /** Collected ÷ billed, both overall and per billingPeriod bucket. */
  async tuitionCollectionRate(query: TuitionReportQueryDto) {
    const [billed, collected] = await Promise.all([this.tuitionBilled(query), this.tuitionCollected(query)]);
    const collectedByPeriod = new Map(collected.rows.map((r) => [r.billingPeriod, r.totalCollected]));

    const rows = billed.rows.map((r) => {
      const totalCollected = collectedByPeriod.get(r.billingPeriod) ?? 0;
      return {
        billingPeriod: r.billingPeriod,
        totalBilled: r.netAmount,
        totalCollected,
        collectionRate: r.netAmount > 0 ? round2((totalCollected / r.netAmount) * 100) : 0,
      };
    });

    return {
      rows,
      totalBilled: billed.totalBilled,
      totalCollected: collected.totalCollected,
      collectionRate: billed.totalBilled > 0 ? round2((collected.totalCollected / billed.totalBilled) * 100) : 0,
    };
  }

  /** Per-student debt snapshot — every student with at least one non-cancelled charge, computed the same live way as StudentFinanceService.getBalance, just across all students at once. */
  async studentDebtReport() {
    const students = await this.prisma.student.findMany({
      where: { tuitionCharges: { some: { status: { not: 'CANCELLED' } } } },
      select: {
        id: true,
        studentCode: true,
        fullName: true,
        tuitionCharges: {
          where: { status: { not: 'CANCELLED' } },
          select: { netAmount: true, discountAmount: true, dueDate: true, allocations: { select: { amount: true } } },
        },
      },
    });

    const now = new Date();
    const rows = students
      .map((student) => {
        let totalBilled = 0;
        let discounts = 0;
        let paid = 0;
        let overdue = 0;
        for (const charge of student.tuitionCharges) {
          const net = toNumber(charge.netAmount);
          const allocated = charge.allocations.reduce((sum, a) => sum + toNumber(a.amount), 0);
          const outstanding = net - allocated;
          totalBilled += net;
          discounts += toNumber(charge.discountAmount);
          paid += allocated;
          if (outstanding > 0 && charge.dueDate.getTime() < now.getTime()) overdue += outstanding;
        }
        return {
          studentId: student.id,
          studentCode: student.studentCode,
          fullName: student.fullName,
          totalBilled: round2(totalBilled),
          discounts: round2(discounts),
          paid: round2(paid),
          outstanding: round2(totalBilled - paid),
          overdue: round2(overdue),
        };
      })
      .filter((row) => row.outstanding !== 0)
      .sort((a, b) => b.outstanding - a.outstanding);

    const totals = rows.reduce(
      (acc, r) => ({
        totalBilled: acc.totalBilled + r.totalBilled,
        paid: acc.paid + r.paid,
        outstanding: acc.outstanding + r.outstanding,
        overdue: acc.overdue + r.overdue,
      }),
      { totalBilled: 0, paid: 0, outstanding: 0, overdue: 0 },
    );

    return { rows, ...totals };
  }
}
