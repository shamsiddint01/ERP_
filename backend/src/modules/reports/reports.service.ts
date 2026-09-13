import { Injectable } from '@nestjs/common';
import type { AccountCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ACCOUNT_CODES } from '../../shared/finance/account-codes.constant.js';
import type { ReportDateRangeDto } from './dto/report-date-range.dto.js';
import type { TuitionReportQueryDto } from './dto/tuition-report-query.dto.js';

const DEBIT_NORMAL: AccountCategory[] = ['ASSET', 'EXPENSE'];

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

  /** Chronological Dr/Cr lines for one account (or all accounts), with a running balance. */
  async generalLedger(query: ReportDateRangeDto) {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: query.accountId,
        journalEntry: {
          referenceType: query.referenceType,
          entryDate: {
            gte: query.from ? new Date(query.from) : undefined,
            lte: query.to ? endOfDay(query.to) : undefined,
          },
        },
      },
      include: {
        account: { select: { id: true, code: true, name: true, category: true } },
        journalEntry: { select: { entryNumber: true, entryDate: true, description: true, referenceType: true, referenceId: true } },
      },
      orderBy: [{ journalEntry: { entryDate: 'asc' } }, { id: 'asc' }],
    });

    const runningBalanceByAccount = new Map<string, number>();
    const rows = lines.map((line) => {
      const debit = toNumber(line.debit);
      const credit = toNumber(line.credit);
      const isDebitNormal = DEBIT_NORMAL.includes(line.account.category);
      const delta = isDebitNormal ? debit - credit : credit - debit;
      const previous = runningBalanceByAccount.get(line.accountId) ?? 0;
      const runningBalance = previous + delta;
      runningBalanceByAccount.set(line.accountId, runningBalance);

      return {
        entryNumber: line.journalEntry.entryNumber,
        entryDate: line.journalEntry.entryDate,
        description: line.description ?? line.journalEntry.description,
        referenceType: line.journalEntry.referenceType,
        referenceId: line.journalEntry.referenceId,
        account: line.account,
        debit,
        credit,
        runningBalance,
      };
    });

    return { rows, count: rows.length };
  }

  /** Every postable account's net Dr/Cr balance as of a date — always balances (total debit column === total credit column). */
  async trialBalance(query: ReportDateRangeDto) {
    const asOf = query.to ? endOfDay(query.to) : new Date();

    const [accounts, sums] = await Promise.all([
      this.prisma.account.findMany({ where: { isPostable: true }, orderBy: { code: 'asc' } }),
      this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: { journalEntry: { entryDate: { lte: asOf } } },
        _sum: { debit: true, credit: true },
      }),
    ]);

    const sumByAccount = new Map(sums.map((s) => [s.accountId, { debit: toNumber(s._sum.debit), credit: toNumber(s._sum.credit) }]));

    const rows = accounts
      .map((account) => {
        const sum = sumByAccount.get(account.id) ?? { debit: 0, credit: 0 };
        const net = sum.debit - sum.credit;
        return {
          accountId: account.id,
          code: account.code,
          name: account.name,
          category: account.category,
          debit: net > 0 ? net : 0,
          credit: net < 0 ? -net : 0,
        };
      })
      .filter((row) => row.debit !== 0 || row.credit !== 0);

    const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
    const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);

    return { asOf, rows, totalDebit, totalCredit, isBalanced: Math.round((totalDebit - totalCredit) * 100) === 0 };
  }

  /** Revenue minus Expenses for a period — the income statement. */
  async profitAndLoss(query: ReportDateRangeDto) {
    const entryDate = {
      gte: query.from ? new Date(query.from) : undefined,
      lte: query.to ? endOfDay(query.to) : new Date(),
    };

    const accounts = await this.prisma.account.findMany({ where: { category: { in: ['REVENUE', 'EXPENSE'] }, isPostable: true } });
    const sums = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { accountId: { in: accounts.map((a) => a.id) }, journalEntry: { entryDate } },
      _sum: { debit: true, credit: true },
    });
    const sumByAccount = new Map(sums.map((s) => [s.accountId, { debit: toNumber(s._sum.debit), credit: toNumber(s._sum.credit) }]));

    const revenueLines = accounts
      .filter((a) => a.category === 'REVENUE')
      .map((a) => {
        const s = sumByAccount.get(a.id) ?? { debit: 0, credit: 0 };
        return { accountId: a.id, code: a.code, name: a.name, amount: s.credit - s.debit };
      });
    const expenseLines = accounts
      .filter((a) => a.category === 'EXPENSE')
      .map((a) => {
        const s = sumByAccount.get(a.id) ?? { debit: 0, credit: 0 };
        return { accountId: a.id, code: a.code, name: a.name, amount: s.debit - s.credit };
      });

    const totalRevenue = revenueLines.reduce((sum, l) => sum + l.amount, 0);
    const totalExpense = expenseLines.reduce((sum, l) => sum + l.amount, 0);

    return {
      from: query.from ?? null,
      to: query.to ?? new Date().toISOString().slice(0, 10),
      revenueLines,
      expenseLines,
      totalRevenue,
      totalExpense,
      netIncome: totalRevenue - totalExpense,
    };
  }

  /** Assets vs Liabilities + Equity (including unclosed current-period retained earnings) as of a date. */
  async balanceSheet(query: ReportDateRangeDto) {
    const asOf = query.to ? endOfDay(query.to) : new Date();

    const accounts = await this.prisma.account.findMany({ where: { isPostable: true } });
    const sums = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { journalEntry: { entryDate: { lte: asOf } } },
      _sum: { debit: true, credit: true },
    });
    const sumByAccount = new Map(sums.map((s) => [s.accountId, { debit: toNumber(s._sum.debit), credit: toNumber(s._sum.credit) }]));

    const lineFor = (category: AccountCategory, sign: 1 | -1) =>
      accounts
        .filter((a) => a.category === category)
        .map((a) => {
          const s = sumByAccount.get(a.id) ?? { debit: 0, credit: 0 };
          const amount = sign === 1 ? s.debit - s.credit : s.credit - s.debit;
          return { accountId: a.id, code: a.code, name: a.name, amount };
        })
        .filter((l) => l.amount !== 0);

    const assetLines = lineFor('ASSET', 1);
    const liabilityLines = lineFor('LIABILITY', -1);
    const equityLines = lineFor('EQUITY', -1);
    const revenueTotal = lineFor('REVENUE', -1).reduce((sum, l) => sum + l.amount, 0);
    const expenseTotal = lineFor('EXPENSE', 1).reduce((sum, l) => sum + l.amount, 0);
    const retainedEarnings = revenueTotal - expenseTotal;

    const totalAssets = assetLines.reduce((sum, l) => sum + l.amount, 0);
    const totalLiabilities = liabilityLines.reduce((sum, l) => sum + l.amount, 0);
    const totalEquity = equityLines.reduce((sum, l) => sum + l.amount, 0) + retainedEarnings;

    return {
      asOf,
      assetLines,
      liabilityLines,
      equityLines: [...equityLines, { accountId: null, code: null, name: 'Current period retained earnings', amount: retainedEarnings }],
      totalAssets,
      totalLiabilities,
      totalEquity,
      isBalanced: Math.round((totalAssets - (totalLiabilities + totalEquity)) * 100) === 0,
    };
  }

  /** Net movement on Cash + Bank accounts for a period, with opening/closing balances and the underlying entries. */
  async cashFlow(query: ReportDateRangeDto) {
    const from = query.from ? new Date(query.from) : new Date(0);
    const to = query.to ? endOfDay(query.to) : new Date();

    const cashAccounts = await this.prisma.account.findMany({ where: { code: { in: [ACCOUNT_CODES.CASH, ACCOUNT_CODES.BANK] } } });
    const cashAccountIds = cashAccounts.map((a) => a.id);

    const [openingSum, periodLines] = await Promise.all([
      this.prisma.journalLine.aggregate({
        where: { accountId: { in: cashAccountIds }, journalEntry: { entryDate: { lt: from } } },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.journalLine.findMany({
        where: { accountId: { in: cashAccountIds }, journalEntry: { entryDate: { gte: from, lte: to } } },
        include: {
          account: { select: { id: true, code: true, name: true } },
          journalEntry: { select: { entryNumber: true, entryDate: true, description: true, referenceType: true } },
        },
        orderBy: { journalEntry: { entryDate: 'asc' } },
      }),
    ]);

    const openingBalance = toNumber(openingSum._sum.debit) - toNumber(openingSum._sum.credit);
    const inflows = periodLines.reduce((sum, l) => sum + toNumber(l.debit), 0);
    const outflows = periodLines.reduce((sum, l) => sum + toNumber(l.credit), 0);
    const netChange = inflows - outflows;

    return {
      from: query.from ?? null,
      to: query.to ?? new Date().toISOString().slice(0, 10),
      openingBalance,
      inflows,
      outflows,
      netChange,
      closingBalance: openingBalance + netChange,
      entries: periodLines.map((l) => ({
        entryNumber: l.journalEntry.entryNumber,
        entryDate: l.journalEntry.entryDate,
        description: l.description ?? l.journalEntry.description,
        referenceType: l.journalEntry.referenceType,
        account: l.account,
        debit: toNumber(l.debit),
        credit: toNumber(l.credit),
      })),
    };
  }

  /** Accounts Receivable control account vs the sum of individual Customer.balance rows — should always match. */
  async arReconciliation() {
    const [account, customerSum] = await Promise.all([
      this.prisma.account.findUnique({ where: { code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE } }),
      this.prisma.customer.aggregate({ where: { deletedAt: null }, _sum: { balance: true } }),
    ]);
    const controlBalance = toNumber(account?.currentBalance);
    const subledgerTotal = toNumber(customerSum._sum.balance);
    return { controlBalance, subledgerTotal, variance: controlBalance - subledgerTotal };
  }

  /** Accounts Payable control account vs the sum of individual Supplier.balance rows — should always match. */
  async apReconciliation() {
    const [account, supplierSum] = await Promise.all([
      this.prisma.account.findUnique({ where: { code: ACCOUNT_CODES.ACCOUNTS_PAYABLE } }),
      this.prisma.supplier.aggregate({ where: { deletedAt: null }, _sum: { balance: true } }),
    ]);
    const controlBalance = toNumber(account?.currentBalance);
    const subledgerTotal = toNumber(supplierSum._sum.balance);
    return { controlBalance, subledgerTotal, variance: controlBalance - subledgerTotal };
  }

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
