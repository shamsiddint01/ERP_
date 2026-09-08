import { describe, expect, it, vi } from 'vitest';
import { ReportsService } from './reports.service.js';

const ACCOUNTS = [
  { id: 'ar', code: '1300', name: 'Accounts Receivable', category: 'ASSET', isPostable: true, currentBalance: 600 },
  { id: 'rev', code: '4100', name: 'Sales Revenue', category: 'REVENUE', isPostable: true, currentBalance: 1000 },
  { id: 'cash', code: '1100', name: 'Cash', category: 'ASSET', isPostable: true, currentBalance: 400 },
  { id: 'rent', code: '5100', name: 'Rent Expense', category: 'EXPENSE', isPostable: true, currentBalance: 200 },
  { id: 'ap', code: '2100', name: 'Accounts Payable', category: 'LIABILITY', isPostable: true, currentBalance: 200 },
  { id: 'equity', code: '3100', name: "Owner's Equity", category: 'EQUITY', isPostable: true, currentBalance: 0 },
];

// Sale of 1000 (Dr AR / Cr Revenue), partial cash collection of 400 (Dr Cash / Cr AR), rent expense of 200 (Dr Rent / Cr AP).
const SUMS: Record<string, { debit: number; credit: number }> = {
  ar: { debit: 1000, credit: 400 },
  rev: { debit: 0, credit: 1000 },
  cash: { debit: 400, credit: 0 },
  rent: { debit: 200, credit: 0 },
  ap: { debit: 0, credit: 200 },
  equity: { debit: 0, credit: 0 },
};

function createPrismaMock() {
  return {
    account: {
      findMany: vi.fn().mockResolvedValue(ACCOUNTS),
      findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(ACCOUNTS.find((a) => a.code === where.code) ?? null)),
    },
    journalLine: {
      groupBy: vi.fn().mockImplementation(({ where }) => {
        const ids: string[] | undefined = where?.accountId?.in;
        const relevant = ids ? ACCOUNTS.filter((a) => ids.includes(a.id)) : ACCOUNTS;
        return Promise.resolve(relevant.map((a) => ({ accountId: a.id, _sum: SUMS[a.id] })));
      }),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { debit: 0, credit: 0 } }),
    },
    customer: { aggregate: vi.fn().mockResolvedValue({ _sum: { balance: 600 } }) },
    supplier: { aggregate: vi.fn().mockResolvedValue({ _sum: { balance: 200 } }) },
  };
}

describe('ReportsService', () => {
  it('trialBalance always balances (total debit column equals total credit column)', async () => {
    const service = new ReportsService(createPrismaMock() as never);
    const report = await service.trialBalance({});

    expect(report.totalDebit).toBe(report.totalCredit);
    expect(report.isBalanced).toBe(true);
    // AR net = 1000-400 = 600 (debit balance); Cash = 400 (debit); Rent = 200 (debit)
    // Revenue = 1000 (credit); AP = 200 (credit)
    expect(report.totalDebit).toBe(1200);
    expect(report.totalCredit).toBe(1200);
  });

  it('profitAndLoss computes net income as revenue minus expense', async () => {
    const service = new ReportsService(createPrismaMock() as never);
    const report = await service.profitAndLoss({});

    expect(report.totalRevenue).toBe(1000);
    expect(report.totalExpense).toBe(200);
    expect(report.netIncome).toBe(800);
  });

  it('balanceSheet balances: assets equal liabilities plus equity (including retained earnings)', async () => {
    const service = new ReportsService(createPrismaMock() as never);
    const report = await service.balanceSheet({});

    expect(report.isBalanced).toBe(true);
    expect(Math.round((report.totalAssets - (report.totalLiabilities + report.totalEquity)) * 100)).toBe(0);
  });

  it('arReconciliation reports the variance between the control account and the customer subledger', async () => {
    const service = new ReportsService(createPrismaMock() as never);
    const report = await service.arReconciliation();

    // control balance = ar net = 600; subledger = 600 (mocked) => zero variance
    expect(report.controlBalance).toBe(600);
    expect(report.subledgerTotal).toBe(600);
    expect(report.variance).toBe(0);
  });
});
