import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { OrdersService } from './orders.service.js';

function createFakeOrder(overrides: Partial<{ status: string; amountPaid: string; grandTotal: string }> = {}) {
  return {
    id: 'order1',
    orderNumber: 'ORD-2026-000001',
    customerId: 'cust1',
    warehouseId: 'wh1',
    status: overrides.status ?? 'DRAFT',
    grandTotal: overrides.grandTotal ?? '1000',
    amountPaid: overrides.amountPaid ?? '0',
    items: [{ id: 'item1', productId: 'p1', quantity: '5' }],
  };
}

function createPrismaMock(order: ReturnType<typeof createFakeOrder>) {
  let lastUpdateData: Record<string, unknown> = {};
  const txStub = {
    order: {
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...order, ...data })),
      updateMany: vi.fn().mockImplementation(({ data }) => {
        lastUpdateData = data;
        return Promise.resolve({ count: 1 });
      }),
      findUniqueOrThrow: vi.fn().mockImplementation(() => Promise.resolve({ ...order, ...lastUpdateData })),
      findUnique: vi.fn().mockImplementation(() => Promise.resolve({ ...order, ...lastUpdateData, items: [] })),
    },
    customer: { update: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return {
    order: { findUnique: vi.fn().mockResolvedValue(order), count: vi.fn().mockResolvedValue(0) },
    customer: { findUnique: vi.fn().mockResolvedValue({ id: 'cust1', status: 'ACTIVE', deletedAt: null }) },
    product: { findMany: vi.fn().mockResolvedValue([{ id: 'p1', status: 'ACTIVE', deletedAt: null, name: 'Test' }]) },
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(txStub)),
    __tx: txStub,
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>, overrides: Record<string, unknown> = {}) {
  const registry = new AuditEntityRegistryService();
  const inventoryService = { reserveStock: vi.fn().mockResolvedValue(undefined), releaseReservedStock: vi.fn().mockResolvedValue(undefined), fulfillReservedStock: vi.fn().mockResolvedValue({}) };
  const financeLedger = { recordSale: vi.fn().mockResolvedValue({}) };
  const invoicesService = { createFromOrder: vi.fn().mockResolvedValue({ id: 'inv1', invoiceNumber: 'INV-2026-000001', grandTotal: '1000' }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new OrdersService(prisma as any, { ...inventoryService, ...overrides.inventoryService } as any, financeLedger as any, invoicesService as any, registry);
}

describe('OrdersService', () => {
  describe('create', () => {
    it('rejects an order for an inactive customer', async () => {
      const prisma = createPrismaMock(createFakeOrder());
      prisma.customer.findUnique.mockResolvedValue({ id: 'cust1', status: 'INACTIVE', deletedAt: null });
      const service = createService(prisma);

      await expect(
        service.create({ customerId: 'cust1', warehouseId: 'wh1', orderDate: '2026-09-07', items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an order containing a discontinued product', async () => {
      const prisma = createPrismaMock(createFakeOrder());
      prisma.product.findMany.mockResolvedValue([{ id: 'p1', status: 'DISCONTINUED', deletedAt: null, name: 'Old product' }]);
      const service = createService(prisma);

      await expect(
        service.create({ customerId: 'cust1', warehouseId: 'wh1', orderDate: '2026-09-07', items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('status transitions', () => {
    it('refuses to confirm a non-DRAFT order', async () => {
      const prisma = createPrismaMock(createFakeOrder({ status: 'COMPLETED' }));
      const service = createService(prisma);
      await expect(service.confirm('order1')).rejects.toThrow(ConflictException);
    });

    it('refuses to complete an order that is not PROCESSING', async () => {
      const prisma = createPrismaMock(createFakeOrder({ status: 'CONFIRMED' }));
      const service = createService(prisma);
      await expect(service.complete('order1', 'user1')).rejects.toThrow(ConflictException);
    });

    it('refuses to cancel a COMPLETED order', async () => {
      const prisma = createPrismaMock(createFakeOrder({ status: 'COMPLETED' }));
      const service = createService(prisma);
      await expect(service.cancel('order1', { reason: 'test' })).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException instead of double-completing when the status changed concurrently', async () => {
      const prisma = createPrismaMock(createFakeOrder({ status: 'PROCESSING' }));
      prisma.__tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
      const service = createService(prisma);
      await expect(service.complete('order1', 'user1')).rejects.toThrow(ConflictException);
    });

    it('releases the stock reservation when cancelling a CONFIRMED order', async () => {
      const prisma = createPrismaMock(createFakeOrder({ status: 'CONFIRMED' }));
      const releaseReservedStock = vi.fn().mockResolvedValue(undefined);
      const service = createService(prisma, { inventoryService: { releaseReservedStock } });

      await service.cancel('order1', { reason: 'customer request' });

      expect(releaseReservedStock).toHaveBeenCalledWith({ productId: 'p1', warehouseId: 'wh1', quantity: 5 }, prisma.__tx);
    });

    it('fulfills stock, posts revenue, and updates customer balance on complete', async () => {
      const prisma = createPrismaMock(createFakeOrder({ status: 'PROCESSING', grandTotal: '1000', amountPaid: '0' }));
      const fulfillReservedStock = vi.fn().mockResolvedValue({});
      const service = createService(prisma, { inventoryService: { fulfillReservedStock } });

      await service.complete('order1', 'user1');

      expect(fulfillReservedStock).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'p1', warehouseId: 'wh1', quantity: 5, referenceType: 'SALE' }),
        prisma.__tx,
      );
      expect(prisma.__tx.customer.update).toHaveBeenCalledWith({ where: { id: 'cust1' }, data: { balance: { increment: 1000 } } });
    });
  });

  describe('applyPayment', () => {
    it('rejects a payment that exceeds the remaining balance', async () => {
      const prisma = createPrismaMock(createFakeOrder({ grandTotal: '1000', amountPaid: '400' }));
      const service = createService(prisma);

      await expect(service.applyPayment('order1', 700, prisma.__tx as never)).rejects.toThrow(BadRequestException);
    });

    it('accepts a payment within the remaining balance and recomputes paymentStatus', async () => {
      const prisma = createPrismaMock(createFakeOrder({ grandTotal: '1000', amountPaid: '400' }));
      const service = createService(prisma);

      const result = await service.applyPayment('order1', 600, prisma.__tx as never);

      expect(result).toMatchObject({ amountPaid: 1000, paymentStatus: 'PAID' });
    });

    it('throws ConflictException instead of a lost update when amountPaid changed concurrently', async () => {
      const prisma = createPrismaMock(createFakeOrder({ grandTotal: '1000', amountPaid: '400' }));
      prisma.__tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
      const service = createService(prisma);

      await expect(service.applyPayment('order1', 600, prisma.__tx as never)).rejects.toThrow(ConflictException);
    });
  });
});
