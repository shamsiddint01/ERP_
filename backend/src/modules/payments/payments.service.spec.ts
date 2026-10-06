import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { PaymentsService } from './payments.service.js';

function createPrismaMock() {
  let lastUpdateData: Record<string, unknown> = {};
  const txStub = {
    student: { findUnique: vi.fn().mockResolvedValue({ id: 'student1', fullName: 'Test Student' }) },
    payment: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pay1', paymentNumber: 'PAY-2026-000001', ...data })),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockImplementation(({ data }) => {
        lastUpdateData = data;
        return Promise.resolve({ count: 1 });
      }),
      findUniqueOrThrow: vi.fn().mockImplementation(() => Promise.resolve({ id: 'pay1', ...lastUpdateData })),
    },
  };
  return { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)), __tx: txStub };
}

function createService(
  prisma: ReturnType<typeof createPrismaMock>,
  overrides: { tuitionAllocationService?: Record<string, unknown>; notifications?: Record<string, unknown> } = {},
) {
  const registry = new AuditEntityRegistryService();
  const tuitionAllocationService = {
    allocate: vi.fn().mockResolvedValue({}),
    reverseAllocationsForPayment: vi.fn().mockResolvedValue(undefined),
    ...overrides.tuitionAllocationService,
  };
  const notifications = { notifyByPermission: vi.fn().mockResolvedValue(0), ...overrides.notifications };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PaymentsService(prisma as any, tuitionAllocationService as any, notifications as any, registry);
}

describe('PaymentsService.create', () => {
  it('throws NotFoundException for a payment against a non-existent student', async () => {
    const prisma = createPrismaMock();
    prisma.__tx.student.findUnique.mockResolvedValue(null);
    const service = createService(prisma);

    await expect(service.create({ referenceType: 'TUITION_CHARGE', referenceId: 'missing', amount: 100, method: 'CASH' }, 'user1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('records a COMPLETED inbound payment against the student', async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);

    await service.create({ referenceType: 'TUITION_CHARGE', referenceId: 'student1', amount: 500, method: 'CASH' }, 'user1');

    expect(prisma.__tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: 'INBOUND', status: 'COMPLETED', amount: 500, referenceType: 'TUITION_CHARGE', referenceId: 'student1', recordedByUserId: 'user1' }),
      }),
    );
  });

  it('fires a TUITION_PAYMENT_RECEIVED notification only after the transaction commits', async () => {
    const prisma = createPrismaMock();
    const notifyByPermission = vi.fn().mockResolvedValue(0);
    const service = createService(prisma, { notifications: { notifyByPermission } });

    await service.create({ referenceType: 'TUITION_CHARGE', referenceId: 'student1', amount: 500, method: 'CASH' }, 'user1');

    expect(notifyByPermission).toHaveBeenCalledWith('tuition', 'VIEW', expect.objectContaining({ type: 'TUITION_PAYMENT_RECEIVED' }));
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('does not notify when the transaction fails', async () => {
    const prisma = createPrismaMock();
    prisma.__tx.student.findUnique.mockResolvedValue(null);
    const notifyByPermission = vi.fn().mockResolvedValue(0);
    const service = createService(prisma, { notifications: { notifyByPermission } });

    await expect(service.create({ referenceType: 'TUITION_CHARGE', referenceId: 'missing', amount: 100, method: 'CASH' }, 'user1')).rejects.toThrow();
    expect(notifyByPermission).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.refund', () => {
  it('refuses to refund a payment that is not COMPLETED', async () => {
    const prisma = createPrismaMock();
    prisma.__tx.payment.findUnique.mockResolvedValue({ id: 'pay1', status: 'REFUNDED' });
    const service = createService(prisma);

    await expect(service.refund('pay1')).rejects.toThrow(ConflictException);
  });

  it('reverses allocations and marks the payment REFUNDED', async () => {
    const prisma = createPrismaMock();
    prisma.__tx.payment.findUnique.mockResolvedValue({ id: 'pay1', status: 'COMPLETED', amount: '500', referenceType: 'TUITION_CHARGE', referenceId: 'student1' });
    const reverseAllocationsForPayment = vi.fn().mockResolvedValue(undefined);
    const service = createService(prisma, { tuitionAllocationService: { reverseAllocationsForPayment } });

    const result = await service.refund('pay1');

    expect(reverseAllocationsForPayment).toHaveBeenCalledWith('pay1', prisma.__tx);
    expect(result).toEqual(expect.objectContaining({ status: 'REFUNDED' }));
  });

  it('throws ConflictException instead of double-refunding when the payment status changed concurrently', async () => {
    const prisma = createPrismaMock();
    prisma.__tx.payment.findUnique.mockResolvedValue({ id: 'pay1', status: 'COMPLETED', amount: '500', referenceType: 'TUITION_CHARGE', referenceId: 'student1' });
    prisma.__tx.payment.updateMany.mockResolvedValueOnce({ count: 0 });
    const service = createService(prisma);

    await expect(service.refund('pay1')).rejects.toThrow(ConflictException);
  });
});

describe('PaymentsService.findAll', () => {
  it('attaches each payment\'s payer student, resolved from referenceId in a single query', async () => {
    const prisma = {
      ...createPrismaMock(),
      payment: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'pay1', referenceId: 's1' },
          { id: 'pay2', referenceId: 'gone' },
        ]),
        count: vi.fn().mockResolvedValue(2),
      },
      student: { findMany: vi.fn().mockResolvedValue([{ id: 's1', studentCode: 'STU-1', fullName: 'Malika Yusupova' }]) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = createService(prisma as any);

    const result = await service.findAll({ page: 1, pageSize: 20 });

    expect(prisma.student.findMany).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([
      expect.objectContaining({ id: 'pay1', student: { id: 's1', studentCode: 'STU-1', fullName: 'Malika Yusupova' } }),
      expect.objectContaining({ id: 'pay2', student: null }),
    ]);
  });
});

describe('PaymentsService.allocate', () => {
  it('delegates to TuitionAllocationService.allocate', async () => {
    const prisma = createPrismaMock();
    const allocate = vi.fn().mockResolvedValue({ paymentId: 'pay1', allocations: [] });
    const service = createService(prisma, { tuitionAllocationService: { allocate } });

    await service.allocate('pay1', { allocations: [{ tuitionChargeId: 'charge1', amount: 100 }] }, 'user1');

    expect(allocate).toHaveBeenCalledWith('pay1', [{ tuitionChargeId: 'charge1', amount: 100 }], 'user1');
  });
});
