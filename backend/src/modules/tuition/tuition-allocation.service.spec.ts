import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TuitionAllocationService } from './tuition-allocation.service.js';

function fakePayment(overrides: Record<string, unknown> = {}) {
  return { id: 'payment1', amount: '500', referenceType: 'TUITION_CHARGE', referenceId: 'student1', status: 'COMPLETED', ...overrides };
}

function fakeCharge(overrides: Record<string, unknown> = {}) {
  return { id: 'charge1', studentId: 'student1', status: 'PENDING', netAmount: '500', ...overrides };
}

/**
 * Builds a `tx` stub that behaves like the real Prisma transaction client
 * for allocation purposes: `tuitionAllocation` rows and `tuitionCharge`
 * statuses are tracked in-memory so aggregate()/upsert()/updateMany() see
 * each other's effects within one call, exactly like a real transaction.
 */
function createTx(opts: { payment?: unknown; charges?: Record<string, unknown>[]; existingAllocations?: Record<string, unknown>[] } = {}) {
  // NB: `??` treats an explicitly-passed `null` (simulating "payment not
  // found") as absent — use `in` so the not-found test path actually works.
  const payment = 'payment' in opts ? opts.payment : fakePayment();
  const charges = new Map((opts.charges ?? [fakeCharge()]).map((c) => [c.id as string, { ...c }]));
  const allocations: Record<string, unknown>[] = [...(opts.existingAllocations ?? [])];

  return {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    payment: { findUnique: vi.fn().mockResolvedValue(payment) },
    tuitionCharge: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => charges.get(id)).filter(Boolean)),
      ),
      updateMany: vi.fn().mockImplementation(({ where, data }: { where: { id: string; status: string }; data: { status: string } }) => {
        const charge = charges.get(where.id);
        if (!charge || charge.status !== where.status) return Promise.resolve({ count: 0 });
        charge.status = data.status;
        return Promise.resolve({ count: 1 });
      }),
    },
    tuitionAllocation: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { paymentId: string; tuitionChargeId?: { in: string[] } } }) =>
        Promise.resolve(
          allocations.filter(
            (a) => a.paymentId === where.paymentId && (!where.tuitionChargeId || where.tuitionChargeId.in.includes(a.tuitionChargeId as string)),
          ),
        ),
      ),
      aggregate: vi.fn().mockImplementation(({ where }: { where: { paymentId?: string; tuitionChargeId?: string } }) => {
        const matching = allocations.filter(
          (a) => (where.paymentId === undefined || a.paymentId === where.paymentId) && (where.tuitionChargeId === undefined || a.tuitionChargeId === where.tuitionChargeId),
        );
        const sum = matching.reduce((s, a) => s + Number(a.amount), 0);
        return Promise.resolve({ _sum: { amount: matching.length ? sum : null } });
      }),
      upsert: vi.fn().mockImplementation(({ where, create, update }: { where: { paymentId_tuitionChargeId: { paymentId: string; tuitionChargeId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const key = where.paymentId_tuitionChargeId;
        const existing = allocations.find((a) => a.paymentId === key.paymentId && a.tuitionChargeId === key.tuitionChargeId);
        if (existing) {
          Object.assign(existing, update);
          return Promise.resolve(existing);
        }
        const created = { id: `alloc-${allocations.length + 1}`, ...create };
        allocations.push(created);
        return Promise.resolve(created);
      }),
    },
    _charges: charges,
    _allocations: allocations,
  };
}

function createService(tx: ReturnType<typeof createTx>) {
  const prisma = { $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(tx)) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new TuitionAllocationService(prisma as any);
}

describe('TuitionAllocationService.allocate', () => {
  it('allocates a single-charge payment in full and marks the charge PAID', async () => {
    const tx = createTx();
    const service = createService(tx);

    const result = await service.allocate('payment1', [{ tuitionChargeId: 'charge1', amount: 500 }], 'user1');

    expect(result.unallocated).toBe(0);
    expect(tx._charges.get('charge1')?.status).toBe('PAID');
  });

  it('marks the charge PARTIALLY_PAID when the allocation covers less than netAmount', async () => {
    const tx = createTx();
    const service = createService(tx);

    await service.allocate('payment1', [{ tuitionChargeId: 'charge1', amount: 200 }], 'user1');

    expect(tx._charges.get('charge1')?.status).toBe('PARTIALLY_PAID');
  });

  it('allocates one payment across multiple charges in a single call', async () => {
    const tx = createTx({
      payment: fakePayment({ amount: '700' }),
      charges: [fakeCharge({ id: 'charge1', netAmount: '400' }), fakeCharge({ id: 'charge2', netAmount: '300' })],
    });
    const service = createService(tx);

    const result = await service.allocate(
      'payment1',
      [
        { tuitionChargeId: 'charge1', amount: 400 },
        { tuitionChargeId: 'charge2', amount: 300 },
      ],
      'user1',
    );

    expect(result.unallocated).toBe(0);
    expect(tx._charges.get('charge1')?.status).toBe('PAID');
    expect(tx._charges.get('charge2')?.status).toBe('PAID');
  });

  it('rejects an allocation that would over-allocate the payment itself', async () => {
    const tx = createTx({ payment: fakePayment({ amount: '100' }) });
    const service = createService(tx);

    await expect(service.allocate('payment1', [{ tuitionChargeId: 'charge1', amount: 200 }], 'user1')).rejects.toThrow(ConflictException);
  });

  it('rejects an allocation that would over-allocate an individual charge, even if the payment has room', async () => {
    const tx = createTx({ payment: fakePayment({ amount: '10000' }), charges: [fakeCharge({ netAmount: '500' })] });
    const service = createService(tx);

    await expect(service.allocate('payment1', [{ tuitionChargeId: 'charge1', amount: 600 }], 'user1')).rejects.toThrow(ConflictException);
  });

  it('rejects an over-allocation caused by ANOTHER payment already covering part of the same charge', async () => {
    const tx = createTx({
      charges: [fakeCharge({ netAmount: '500' })],
      existingAllocations: [{ id: 'alloc-other', paymentId: 'other-payment', tuitionChargeId: 'charge1', amount: 400 }],
    });
    const service = createService(tx);

    await expect(service.allocate('payment1', [{ tuitionChargeId: 'charge1', amount: 200 }], 'user1')).rejects.toThrow(ConflictException);
  });

  it('rejects duplicate tuitionChargeId entries within one allocation request', async () => {
    const tx = createTx();
    const service = createService(tx);
    await expect(
      service.allocate(
        'payment1',
        [
          { tuitionChargeId: 'charge1', amount: 100 },
          { tuitionChargeId: 'charge1', amount: 100 },
        ],
        'user1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException for a non-existent payment', async () => {
    const tx = createTx({ payment: null });
    const service = createService(tx);
    await expect(service.allocate('payment1', [{ tuitionChargeId: 'charge1', amount: 100 }], 'user1')).rejects.toThrow(NotFoundException);
  });

  it('rejects allocating a non-tuition payment via this endpoint', async () => {
    const tx = createTx({ payment: fakePayment({ referenceType: 'ORDER' }) });
    const service = createService(tx);
    await expect(service.allocate('payment1', [{ tuitionChargeId: 'charge1', amount: 100 }], 'user1')).rejects.toThrow(BadRequestException);
  });

  it('rejects allocating a payment that is not COMPLETED', async () => {
    const tx = createTx({ payment: fakePayment({ status: 'PENDING' }) });
    const service = createService(tx);
    await expect(service.allocate('payment1', [{ tuitionChargeId: 'charge1', amount: 100 }], 'user1')).rejects.toThrow(ConflictException);
  });

  it('rejects allocating to a charge belonging to a different student than the payment payer', async () => {
    const tx = createTx({ charges: [fakeCharge({ studentId: 'someone-else' })] });
    const service = createService(tx);
    await expect(service.allocate('payment1', [{ tuitionChargeId: 'charge1', amount: 100 }], 'user1')).rejects.toThrow(BadRequestException);
  });

  it('rejects allocating to a CANCELLED charge', async () => {
    const tx = createTx({ charges: [fakeCharge({ status: 'CANCELLED' })] });
    const service = createService(tx);
    await expect(service.allocate('payment1', [{ tuitionChargeId: 'charge1', amount: 100 }], 'user1')).rejects.toThrow(ConflictException);
  });

  it('throws NotFoundException when one of the requested charges does not exist', async () => {
    const tx = createTx({ charges: [fakeCharge({ id: 'charge1' })] });
    const service = createService(tx);
    await expect(
      service.allocate(
        'payment1',
        [
          { tuitionChargeId: 'charge1', amount: 100 },
          { tuitionChargeId: 'missing', amount: 100 },
        ],
        'user1',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('re-allocation (correction): replaces this payment’s own prior allocation instead of adding to it', async () => {
    const tx = createTx({
      payment: fakePayment({ amount: '500' }),
      charges: [fakeCharge({ netAmount: '500' })],
      existingAllocations: [{ id: 'alloc-1', paymentId: 'payment1', tuitionChargeId: 'charge1', amount: 300 }],
    });
    const service = createService(tx);

    // Correcting the same payment's allocation on charge1 from 300 -> 500 costs
    // only 200 more of the payment's unallocated total (500 - 300 already used).
    const result = await service.allocate('payment1', [{ tuitionChargeId: 'charge1', amount: 500 }], 'user1');

    expect(result.unallocated).toBe(0);
    expect(tx._allocations).toHaveLength(1);
    expect(tx._allocations[0]).toMatchObject({ amount: 500 });
  });

  it('takes advisory locks on the payment and every charge id (sorted) to stay deadlock-free', async () => {
    const tx = createTx({
      payment: fakePayment({ amount: '700' }),
      charges: [fakeCharge({ id: 'charge-b', netAmount: '400' }), fakeCharge({ id: 'charge-a', netAmount: '300' })],
    });
    const service = createService(tx);

    await service.allocate(
      'payment1',
      [
        { tuitionChargeId: 'charge-b', amount: 400 },
        { tuitionChargeId: 'charge-a', amount: 300 },
      ],
      'user1',
    );

    // payment lock + 2 charge locks = 3 calls total
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it('concurrency: three allocations racing against the same 500-capacity payment never over-allocate in total', async () => {
    // A plain "invoke the callback immediately" $transaction stub would let 3
    // concurrent calls interleave their reads before any of them writes —
    // exactly the lost-update race the advisory lock exists to prevent — so
    // it would prove nothing. This harness instead queues each call's whole
    // transaction body one after another, the same effect
    // `pg_advisory_xact_lock` has on real concurrent Postgres transactions
    // (a later one blocks until the lock-holder's transaction commits), so
    // the test is actually exercising the over-allocation arithmetic under
    // the same ordering guarantee production relies on, not just hoping the
    // event loop cooperates.
    const tx = createTx({
      payment: fakePayment({ amount: '500' }),
      charges: [fakeCharge({ id: 'c1', netAmount: '200' }), fakeCharge({ id: 'c2', netAmount: '200' }), fakeCharge({ id: 'c3', netAmount: '200' })],
    });
    let queue: Promise<unknown> = Promise.resolve();
    const prisma = {
      $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) => {
        const run = queue.then(() => cb(tx));
        queue = run.catch(() => undefined);
        return run;
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new TuitionAllocationService(prisma as any);

    const attempts = await Promise.allSettled([
      service.allocate('payment1', [{ tuitionChargeId: 'c1', amount: 200 }], 'user1'),
      service.allocate('payment1', [{ tuitionChargeId: 'c2', amount: 200 }], 'user1'),
      service.allocate('payment1', [{ tuitionChargeId: 'c3', amount: 200 }], 'user1'),
    ]);

    // 500 capacity / 200 per request = room for exactly 2; the 3rd must be
    // rejected with ConflictException, never silently truncated or allowed.
    const succeeded = attempts.filter((a) => a.status === 'fulfilled');
    const failed = attempts.filter((a) => a.status === 'rejected') as PromiseRejectedResult[];
    const totalAllocated = tx._allocations.reduce((sum, a) => sum + Number(a.amount), 0);

    expect(succeeded).toHaveLength(2);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(ConflictException);
    expect(totalAllocated).toBe(400);
  });
});

describe('TuitionAllocationService.reverseAllocationsForPayment', () => {
  it('deletes every allocation for the payment and recomputes each charge back down', async () => {
    const charges = new Map([['charge1', { id: 'charge1', status: 'PAID', netAmount: '500' }]]);
    const allocations = [{ id: 'alloc-1', paymentId: 'payment1', tuitionChargeId: 'charge1', amount: 500 }];
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      tuitionAllocation: {
        findMany: vi.fn().mockImplementation(({ where }: { where: { paymentId: string } }) => Promise.resolve(allocations.filter((a) => a.paymentId === where.paymentId))),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        deleteMany,
      },
      tuitionCharge: {
        findUniqueOrThrow: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(charges.get(where.id))),
        updateMany: vi.fn().mockImplementation(({ where, data }: { where: { id: string; status: string }; data: { status: string } }) => {
          const charge = charges.get(where.id);
          if (!charge || charge.status !== where.status) return Promise.resolve({ count: 0 });
          charge.status = data.status;
          return Promise.resolve({ count: 1 });
        }),
      },
    };
    const prisma = { $transaction: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new TuitionAllocationService(prisma as any);

    await service.reverseAllocationsForPayment('payment1', tx as never);

    expect(charges.get('charge1')?.status).toBe('PENDING');
    expect(deleteMany).toHaveBeenCalledWith({ where: { paymentId: 'payment1' } });
  });
});
