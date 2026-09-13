import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StudentFinanceService } from './student-finance.service.js';

function fakeCharge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'charge1',
    status: 'PENDING',
    netAmount: '500',
    discountAmount: '0',
    dueDate: new Date(Date.now() + 86_400_000),
    allocations: [],
    ...overrides,
  };
}

function createService(opts: { student?: unknown; charges?: unknown[]; payments?: unknown[]; discounts?: unknown[] } = {}) {
  // NB: `??` treats an explicitly-passed `null` (simulating "not found") as
  // absent — use `in` so the not-found test path actually exercises it.
  const student = 'student' in opts ? opts.student : { id: 'student1' };
  const prisma = {
    student: { findUnique: vi.fn().mockResolvedValue(student) },
    tuitionCharge: { findMany: vi.fn().mockResolvedValue(opts.charges ?? []) },
    payment: { findMany: vi.fn().mockResolvedValue(opts.payments ?? []) },
    studentDiscount: { findMany: vi.fn().mockResolvedValue(opts.discounts ?? []) },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new StudentFinanceService(prisma as any), prisma };
}

describe('StudentFinanceService.getBalance', () => {
  it('throws NotFoundException for a non-existent student', async () => {
    const { service } = createService({ student: null });
    await expect(service.getBalance('missing')).rejects.toThrow(NotFoundException);
  });

  it('computes totalBilled/discounts/paid/outstanding purely from live charge+allocation rows', async () => {
    const { service } = createService({
      charges: [
        fakeCharge({ netAmount: '500', discountAmount: '100', allocations: [{ amount: '200' }] }),
        fakeCharge({ netAmount: '300', discountAmount: '0', allocations: [{ amount: '300' }] }),
      ],
    });

    const balance = await service.getBalance('student1');

    expect(balance).toMatchObject({ totalBilled: 800, discounts: 100, paid: 500, outstanding: 300 });
  });

  it('excludes CANCELLED charges (query-level filter, never counted)', async () => {
    const { service, prisma } = createService({ charges: [] });
    await service.getBalance('student1');
    expect(prisma.tuitionCharge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: 'CANCELLED' } }) }),
    );
  });

  it('counts outstanding as overdue only when dueDate has passed AND something remains unpaid', async () => {
    const { service } = createService({
      charges: [
        fakeCharge({ netAmount: '500', allocations: [], dueDate: new Date(Date.now() - 86_400_000) }), // past due, unpaid -> overdue
        fakeCharge({ netAmount: '500', allocations: [{ amount: '500' }], dueDate: new Date(Date.now() - 86_400_000) }), // past due but fully paid -> not overdue
        fakeCharge({ netAmount: '500', allocations: [], dueDate: new Date(Date.now() + 86_400_000) }), // not yet due -> not overdue
      ],
    });

    const balance = await service.getBalance('student1');
    expect(balance.overdue).toBe(500);
  });

  it('never depends on a stored status field for the overdue figure — a lazily-stale PENDING charge past due still counts', async () => {
    const { service } = createService({
      charges: [fakeCharge({ status: 'PENDING', netAmount: '500', allocations: [], dueDate: new Date(Date.now() - 86_400_000) })],
    });
    const balance = await service.getBalance('student1');
    expect(balance.overdue).toBe(500);
  });
});

describe('StudentFinanceService.getFinancialSummary', () => {
  it('returns balance + charges (with allocatedAmount/outstanding) + payments (with unallocatedAmount) + allocationHistory + active discounts', async () => {
    const charge = fakeCharge({ netAmount: '500', allocations: [{ id: 'a1', amount: '200', createdAt: new Date(), payment: { id: 'p1' } }] });
    const payment = { id: 'p1', amount: '300', tuitionAllocations: [{ id: 'a1', amount: '200', tuitionChargeId: 'charge1' }] };
    const { service } = createService({ charges: [charge], payments: [payment], discounts: [{ id: 'sd1' }] });

    const summary = await service.getFinancialSummary('student1');

    expect(summary.charges[0]).toMatchObject({ allocatedAmount: 200, outstanding: 300 });
    expect(summary.payments[0]).toMatchObject({ allocatedAmount: 200, unallocatedAmount: 100 });
    expect(summary.allocationHistory).toHaveLength(1);
    expect(summary.discounts).toEqual([{ id: 'sd1' }]);
    expect(summary.balance).toBeDefined();
  });

  it('only fetches payments referencing this exact student via referenceType/referenceId', async () => {
    const { service, prisma } = createService();
    await service.getFinancialSummary('student1');
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { referenceType: 'TUITION_CHARGE', referenceId: 'student1' } }),
    );
  });

  it('only includes active StudentDiscount grants', async () => {
    const { service, prisma } = createService();
    await service.getFinancialSummary('student1');
    expect(prisma.studentDiscount.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { studentId: 'student1', isActive: true } }));
  });
});
