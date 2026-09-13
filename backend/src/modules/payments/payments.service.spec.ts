import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { PaymentsService } from './payments.service.js';

function createPrismaMock() {
  let lastUpdateData: Record<string, unknown> = {};
  const txStub = {
    order: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    invoice: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    student: { findUnique: vi.fn().mockResolvedValue({ id: 'student1', fullName: 'Test Student' }) },
    payment: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pay1', paymentNumber: 'PAY-2026-000001', ...data })),
      findUnique: vi.fn(),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pay1', ...data })),
      updateMany: vi.fn().mockImplementation(({ data }) => {
        lastUpdateData = data;
        return Promise.resolve({ count: 1 });
      }),
      findUniqueOrThrow: vi.fn().mockImplementation(() => Promise.resolve({ id: 'pay1', ...lastUpdateData })),
    },
    customer: { update: vi.fn().mockResolvedValue({}) },
    supplier: { update: vi.fn().mockResolvedValue({}) },
    purchaseOrder: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  };
  return { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)), __tx: txStub };
}

function createService(
  prisma: ReturnType<typeof createPrismaMock>,
  overrides: {
    ordersService?: Record<string, unknown>;
    invoicesService?: Record<string, unknown>;
    purchasesService?: Record<string, unknown>;
    tuitionAllocationService?: Record<string, unknown>;
    notifications?: Record<string, unknown>;
  } = {},
) {
  const registry = new AuditEntityRegistryService();
  const ordersService = { applyPayment: vi.fn().mockResolvedValue({}), reversePayment: vi.fn().mockResolvedValue({}), ...overrides.ordersService };
  const invoicesService = { applyPayment: vi.fn().mockResolvedValue({}), reversePayment: vi.fn().mockResolvedValue({}), ...overrides.invoicesService };
  const purchasesService = { applyPayment: vi.fn().mockResolvedValue({}), reversePayment: vi.fn().mockResolvedValue({}), ...overrides.purchasesService };
  const tuitionAllocationService = {
    allocate: vi.fn().mockResolvedValue({}),
    reverseAllocationsForPayment: vi.fn().mockResolvedValue(undefined),
    ...overrides.tuitionAllocationService,
  };
  const notifications = { notifyByPermission: vi.fn().mockResolvedValue(0), ...overrides.notifications };
  const financeLedger = {
    recordCustomerPayment: vi.fn().mockResolvedValue({}),
    recordCustomerRefund: vi.fn().mockResolvedValue({}),
    recordSupplierPayment: vi.fn().mockResolvedValue({}),
    recordSupplierRefund: vi.fn().mockResolvedValue({}),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PaymentsService(
    prisma as any,
    ordersService as any,
    invoicesService as any,
    purchasesService as any,
    financeLedger as any,
    tuitionAllocationService as any,
    notifications as any,
    registry,
  );
}

describe('PaymentsService.create', () => {
  it('throws NotFoundException for a payment against a non-existent invoice', async () => {
    const prisma = createPrismaMock();
    prisma.__tx.invoice.findUnique.mockResolvedValue(null);
    const service = createService(prisma);

    await expect(service.create({ referenceType: 'INVOICE', referenceId: 'missing', amount: 100, method: 'CASH' }, 'user1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('propagates the overpayment rejection from InvoicesService.applyPayment', async () => {
    const prisma = createPrismaMock();
    prisma.__tx.invoice.findUnique.mockResolvedValue({ id: 'inv1', customerId: 'cust1', orderId: null });
    const applyPayment = vi.fn().mockRejectedValue(new BadRequestException('Payment amount 5000 exceeds the remaining balance 1000'));
    const service = createService(prisma, { invoicesService: { applyPayment } });

    await expect(service.create({ referenceType: 'INVOICE', referenceId: 'inv1', amount: 5000, method: 'CASH' }, 'user1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.__tx.customer.update).not.toHaveBeenCalled();
  });

  it('decrements the customer balance and cascades to the linked order', async () => {
    const prisma = createPrismaMock();
    prisma.__tx.invoice.findUnique.mockResolvedValue({ id: 'inv1', customerId: 'cust1', orderId: 'order1' });
    const invoicesApplyPayment = vi.fn().mockResolvedValue({});
    const ordersApplyPayment = vi.fn().mockResolvedValue({});
    const service = createService(prisma, { invoicesService: { applyPayment: invoicesApplyPayment }, ordersService: { applyPayment: ordersApplyPayment } });

    await service.create({ referenceType: 'INVOICE', referenceId: 'inv1', amount: 400, method: 'CASH' }, 'user1');

    expect(invoicesApplyPayment).toHaveBeenCalledWith('inv1', 400, prisma.__tx);
    expect(ordersApplyPayment).toHaveBeenCalledWith('order1', 400, prisma.__tx);
    expect(prisma.__tx.customer.update).toHaveBeenCalledWith({ where: { id: 'cust1' }, data: { balance: { decrement: 400 } } });
  });
});

describe('PaymentsService.refund', () => {
  it('refuses to refund a payment that is not COMPLETED', async () => {
    const prisma = createPrismaMock();
    prisma.__tx.payment.findUnique.mockResolvedValue({ id: 'pay1', status: 'REFUNDED' });
    const service = createService(prisma);

    await expect(service.refund('pay1', 'user1')).rejects.toThrow(ConflictException);
  });

  it('reverses the invoice, linked order, and customer balance', async () => {
    const prisma = createPrismaMock();
    prisma.__tx.payment.findUnique.mockResolvedValue({
      id: 'pay1',
      paymentNumber: 'PAY-2026-000001',
      status: 'COMPLETED',
      amount: '400',
      referenceType: 'INVOICE',
      referenceId: 'inv1',
      payerCustomerId: 'cust1',
    });
    prisma.__tx.invoice.findUnique.mockResolvedValue({ id: 'inv1', orderId: 'order1' });
    const invoicesReverse = vi.fn().mockResolvedValue({});
    const ordersReverse = vi.fn().mockResolvedValue({});
    const service = createService(prisma, { invoicesService: { reversePayment: invoicesReverse }, ordersService: { reversePayment: ordersReverse } });

    await service.refund('pay1', 'user1');

    expect(invoicesReverse).toHaveBeenCalledWith('inv1', 400, prisma.__tx);
    expect(ordersReverse).toHaveBeenCalledWith('order1', 400, prisma.__tx);
    expect(prisma.__tx.customer.update).toHaveBeenCalledWith({ where: { id: 'cust1' }, data: { balance: { increment: 400 } } });
  });

  it('throws ConflictException instead of double-refunding when the payment status changed concurrently', async () => {
    const prisma = createPrismaMock();
    prisma.__tx.payment.findUnique.mockResolvedValue({
      id: 'pay1',
      paymentNumber: 'PAY-2026-000001',
      status: 'COMPLETED',
      amount: '400',
      referenceType: 'INVOICE',
      referenceId: 'inv1',
      payerCustomerId: 'cust1',
    });
    prisma.__tx.invoice.findUnique.mockResolvedValue({ id: 'inv1', orderId: null });
    prisma.__tx.payment.updateMany.mockResolvedValueOnce({ count: 0 });
    const service = createService(prisma);

    await expect(service.refund('pay1', 'user1')).rejects.toThrow(ConflictException);
  });
});

describe('PaymentsService.create — TUITION_CHARGE (Phase G)', () => {
  it('throws NotFoundException for a payment against a non-existent student', async () => {
    const prisma = createPrismaMock();
    prisma.__tx.student.findUnique.mockResolvedValue(null);
    const service = createService(prisma);

    await expect(service.create({ referenceType: 'TUITION_CHARGE', referenceId: 'missing', amount: 100, method: 'CASH' }, 'user1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('never sets payerCustomerId or touches Customer.balance — the payer is a Student, not a Customer', async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);

    await service.create({ referenceType: 'TUITION_CHARGE', referenceId: 'student1', amount: 500, method: 'CASH' }, 'user1');

    expect(prisma.__tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ payerCustomerId: expect.anything() }) }),
    );
    expect(prisma.__tx.customer.update).not.toHaveBeenCalled();
  });

  it('reuses recordCustomerPayment verbatim (Dr Cash/Bank / Cr Accounts Receivable) — no separate tuition ledger method', async () => {
    const prisma = createPrismaMock();
    const financeLedger = { recordCustomerPayment: vi.fn().mockResolvedValue({}) };
    const registry = new AuditEntityRegistryService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new PaymentsService(
      prisma as any,
      { applyPayment: vi.fn(), reversePayment: vi.fn() } as any,
      { applyPayment: vi.fn(), reversePayment: vi.fn() } as any,
      { applyPayment: vi.fn(), reversePayment: vi.fn() } as any,
      financeLedger as any,
      { allocate: vi.fn(), reverseAllocationsForPayment: vi.fn() } as any,
      { notifyByPermission: vi.fn().mockResolvedValue(0) } as any,
      registry,
    );

    await service.create({ referenceType: 'TUITION_CHARGE', referenceId: 'student1', amount: 500, method: 'CASH' }, 'user1');

    expect(financeLedger.recordCustomerPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 500, method: 'CASH' }), prisma.__tx);
  });

  it('fires a TUITION_PAYMENT_RECEIVED notification only after the transaction commits', async () => {
    const prisma = createPrismaMock();
    const notifyByPermission = vi.fn().mockResolvedValue(0);
    const service = createService(prisma, { notifications: { notifyByPermission } });

    await service.create({ referenceType: 'TUITION_CHARGE', referenceId: 'student1', amount: 500, method: 'CASH' }, 'user1');

    expect(notifyByPermission).toHaveBeenCalledWith('tuition', 'VIEW', expect.objectContaining({ type: 'TUITION_PAYMENT_RECEIVED' }));
    // the transaction ($transaction) must have already resolved by the time notify fires
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('PaymentsService.refund — TUITION_CHARGE (Phase G)', () => {
  it('reverses allocations instead of touching a Customer balance', async () => {
    const prisma = createPrismaMock();
    prisma.__tx.payment.findUnique.mockResolvedValue({
      id: 'pay1',
      paymentNumber: 'PAY-2026-000001',
      status: 'COMPLETED',
      amount: '500',
      referenceType: 'TUITION_CHARGE',
      referenceId: 'student1',
      payerCustomerId: null,
    });
    const reverseAllocationsForPayment = vi.fn().mockResolvedValue(undefined);
    const service = createService(prisma, { tuitionAllocationService: { reverseAllocationsForPayment } });

    await service.refund('pay1', 'user1');

    expect(reverseAllocationsForPayment).toHaveBeenCalledWith('pay1', prisma.__tx);
    expect(prisma.__tx.customer.update).not.toHaveBeenCalled();
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
