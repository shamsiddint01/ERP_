import { describe, expect, it, vi } from 'vitest';
import { ReportsService } from './reports.service.js';

function createPrismaMock(overrides: { tuitionCharges?: unknown[]; tuitionAllocations?: unknown[]; students?: unknown[] } = {}) {
  return {
    tuitionCharge: { findMany: vi.fn().mockResolvedValue(overrides.tuitionCharges ?? []) },
    tuitionAllocation: { findMany: vi.fn().mockResolvedValue(overrides.tuitionAllocations ?? []) },
    student: { findMany: vi.fn().mockResolvedValue(overrides.students ?? []) },
  };
}

function fakeCharge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'charge1',
    billingPeriod: '2026-09',
    amount: '500000',
    discountAmount: '0',
    netAmount: '500000',
    dueDate: new Date('2026-09-30'),
    student: { studentCode: 'STU-1', fullName: 'Test Student' },
    allocations: [],
    ...overrides,
  };
}

describe('ReportsService — tuition reports', () => {
  it('tuitionBilled buckets net amount by billingPeriod and excludes CANCELLED charges (query-level filter)', async () => {
    const prisma = createPrismaMock({
      tuitionCharges: [
        fakeCharge({ billingPeriod: '2026-09', amount: '500000', discountAmount: '50000', netAmount: '450000' }),
        fakeCharge({ billingPeriod: '2026-09', amount: '300000', discountAmount: '0', netAmount: '300000' }),
        fakeCharge({ billingPeriod: '2026-10', amount: '200000', discountAmount: '0', netAmount: '200000' }),
      ],
    });
    const service = new ReportsService(prisma as never);

    const report = await service.tuitionBilled({});

    expect(report.rows).toEqual([
      { billingPeriod: '2026-09', count: 2, amount: 800000, discountAmount: 50000, netAmount: 750000 },
      { billingPeriod: '2026-10', count: 1, amount: 200000, discountAmount: 0, netAmount: 200000 },
    ]);
    expect(report.totalBilled).toBe(950000);
    expect(prisma.tuitionCharge.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { not: 'CANCELLED' } }) }));
  });

  it('tuitionCollected sums TuitionAllocation.amount by the billingPeriod of the charge it paid off', async () => {
    const prisma = createPrismaMock({
      tuitionAllocations: [
        { amount: '200000', tuitionCharge: { billingPeriod: '2026-09' } },
        { amount: '100000', tuitionCharge: { billingPeriod: '2026-09' } },
        { amount: '150000', tuitionCharge: { billingPeriod: '2026-10' } },
      ],
    });
    const service = new ReportsService(prisma as never);

    const report = await service.tuitionCollected({});

    expect(report.rows).toEqual([
      { billingPeriod: '2026-09', totalCollected: 300000 },
      { billingPeriod: '2026-10', totalCollected: 150000 },
    ]);
    expect(report.totalCollected).toBe(450000);
    expect(report.count).toBe(3);
  });

  it('tuitionOutstanding only lists charges with a positive live outstanding balance, computed from allocations not the stored status', async () => {
    const prisma = createPrismaMock({
      tuitionCharges: [
        fakeCharge({ id: 'fully-paid', netAmount: '500000', allocations: [{ amount: '500000' }], status: 'PAID' }),
        fakeCharge({ id: 'partial', netAmount: '500000', allocations: [{ amount: '200000' }], status: 'PENDING' }),
        fakeCharge({ id: 'unpaid', netAmount: '300000', allocations: [], status: 'PENDING' }),
      ],
    });
    const service = new ReportsService(prisma as never);

    const report = await service.tuitionOutstanding({});

    expect(report.rows.map((r) => r.chargeId)).toEqual(['partial', 'unpaid']);
    expect(report.rows.find((r) => r.chargeId === 'partial')?.outstanding).toBe(300000);
    expect(report.totalOutstanding).toBe(600000);
  });

  it('tuitionOverdue narrows tuitionOutstanding to charges whose dueDate has already passed', async () => {
    const prisma = createPrismaMock({
      tuitionCharges: [
        fakeCharge({ id: 'past-due', netAmount: '300000', allocations: [], dueDate: new Date(Date.now() - 86_400_000) }),
        fakeCharge({ id: 'not-yet-due', netAmount: '300000', allocations: [], dueDate: new Date(Date.now() + 86_400_000) }),
      ],
    });
    const service = new ReportsService(prisma as never);

    const report = await service.tuitionOverdue({});

    expect(report.rows.map((r) => r.chargeId)).toEqual(['past-due']);
    expect(report.totalOverdue).toBe(300000);
  });

  it('tuitionCollectionRate divides collected by billed, per billingPeriod and overall', async () => {
    const prisma = createPrismaMock({
      tuitionCharges: [fakeCharge({ billingPeriod: '2026-09', netAmount: '400000' })],
      tuitionAllocations: [{ amount: '100000', tuitionCharge: { billingPeriod: '2026-09' } }],
    });
    const service = new ReportsService(prisma as never);

    const report = await service.tuitionCollectionRate({});

    expect(report.rows).toEqual([{ billingPeriod: '2026-09', totalBilled: 400000, totalCollected: 100000, collectionRate: 25 }]);
    expect(report.collectionRate).toBe(25);
  });

  it('tuitionCollectionRate reports 0% (not NaN/Infinity) when nothing has been billed yet', async () => {
    const service = new ReportsService(createPrismaMock() as never);
    const report = await service.tuitionCollectionRate({});
    expect(report.collectionRate).toBe(0);
    expect(report.rows).toEqual([]);
  });

  it('studentDebtReport aggregates live per-student totals and excludes students with zero net outstanding', async () => {
    const prisma = createPrismaMock({
      students: [
        {
          id: 's1',
          studentCode: 'STU-1',
          fullName: 'In Debt',
          tuitionCharges: [{ netAmount: '500000', discountAmount: '0', dueDate: new Date(Date.now() - 86_400_000), allocations: [{ amount: '200000' }] }],
        },
        {
          id: 's2',
          studentCode: 'STU-2',
          fullName: 'All Paid Up',
          tuitionCharges: [{ netAmount: '300000', discountAmount: '0', dueDate: new Date(Date.now() - 86_400_000), allocations: [{ amount: '300000' }] }],
        },
      ],
    });
    const service = new ReportsService(prisma as never);

    const report = await service.studentDebtReport();

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ studentId: 's1', totalBilled: 500000, paid: 200000, outstanding: 300000, overdue: 300000 });
    expect(prisma.student.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tuitionCharges: { some: { status: { not: 'CANCELLED' } } } } }));
  });
});
