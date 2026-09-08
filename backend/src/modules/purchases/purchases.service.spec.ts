import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PurchasesService } from './purchases.service.js';

function createFakePo(overrides: Partial<{ status: string; items: Array<{ id: string; productId: string; quantity: string; unitPrice: string; lineTotal: string; quantityReceived: string; product: { name: string } }> }> = {}) {
  return {
    id: 'po1',
    poNumber: 'PO-2026-000001',
    supplierId: 'supplier1',
    warehouseId: 'wh1',
    status: overrides.status ?? 'APPROVED',
    items: overrides.items ?? [
      { id: 'item1', productId: 'p1', quantity: '10', unitPrice: '100', lineTotal: '1000', quantityReceived: '0', product: { name: 'Test product' } },
    ],
  };
}

function createPrismaMock(po: ReturnType<typeof createFakePo>) {
  const txStub = {
    purchaseOrderItem: {
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue(po.items.map((i) => ({ ...i, quantityReceived: i.quantityReceived }))),
    },
    supplier: { update: vi.fn().mockResolvedValue({}) },
    purchaseOrder: { update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...po, ...data })) },
  };

  return {
    purchaseOrder: {
      findUnique: vi.fn().mockResolvedValue(po),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...po, ...data })),
    },
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(txStub)),
    __tx: txStub,
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>, inventoryService: Partial<InventoryService> = {}) {
  const registry = new AuditEntityRegistryService();
  const fakeInventory = { adjustStock: vi.fn().mockResolvedValue({}), ...inventoryService };
  const financeLedger = { recordPurchaseReceipt: vi.fn().mockResolvedValue({}) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PurchasesService(prisma as any, fakeInventory as any, financeLedger as any, registry);
}

describe('PurchasesService.receive', () => {
  it('rejects when the PO is not APPROVED or PARTIALLY_RECEIVED', async () => {
    const po = createFakePo({ status: 'DRAFT' });
    const prisma = createPrismaMock(po);
    const service = createService(prisma);

    await expect(service.receive('po1', { items: [{ purchaseOrderItemId: 'item1', quantityReceived: 5 }] }, 'user1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects receiving more than the remaining quantity', async () => {
    const po = createFakePo({
      items: [{ id: 'item1', productId: 'p1', quantity: '10', unitPrice: '100', lineTotal: '1000', quantityReceived: '8', product: { name: 'Test product' } }],
    });
    const prisma = createPrismaMock(po);
    const service = createService(prisma);

    await expect(service.receive('po1', { items: [{ purchaseOrderItemId: 'item1', quantityReceived: 5 }] }, 'user1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('stocks in via InventoryService and increases the supplier balance proportionally', async () => {
    const po = createFakePo();
    const prisma = createPrismaMock(po);
    const adjustStock = vi.fn().mockResolvedValue({});
    const service = createService(prisma, { adjustStock });

    await service.receive('po1', { items: [{ purchaseOrderItemId: 'item1', quantityReceived: 4 }] }, 'user1');

    expect(adjustStock).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'p1', warehouseId: 'wh1', movementType: 'STOCK_IN', quantity: 4, referenceType: 'PURCHASE' }),
      prisma.__tx,
    );
    // lineTotal 1000 / quantity 10 = 100 per unit; 4 units received => +400
    expect(prisma.__tx.supplier.update).toHaveBeenCalledWith({ where: { id: 'supplier1' }, data: { balance: { increment: 400 } } });
  });

  it('marks the order fully RECEIVED once every line is complete', async () => {
    const po = createFakePo();
    const prisma = createPrismaMock(po);
    prisma.__tx.purchaseOrderItem.findMany.mockResolvedValue([{ quantity: '10', quantityReceived: '10' }]);
    const service = createService(prisma);

    await service.receive('po1', { items: [{ purchaseOrderItemId: 'item1', quantityReceived: 10 }] }, 'user1');

    expect(prisma.__tx.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RECEIVED' }) }),
    );
  });

  it('marks the order PARTIALLY_RECEIVED when some quantity remains', async () => {
    const po = createFakePo();
    const prisma = createPrismaMock(po);
    prisma.__tx.purchaseOrderItem.findMany.mockResolvedValue([{ quantity: '10', quantityReceived: '4' }]);
    const service = createService(prisma);

    await service.receive('po1', { items: [{ purchaseOrderItemId: 'item1', quantityReceived: 4 }] }, 'user1');

    expect(prisma.__tx.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PARTIALLY_RECEIVED' }) }),
    );
  });
});

describe('PurchasesService.cancel', () => {
  it('refuses to cancel once receiving has started', async () => {
    const po = createFakePo({ status: 'PARTIALLY_RECEIVED' });
    const prisma = createPrismaMock(po);
    const service = createService(prisma);

    await expect(service.cancel('po1')).rejects.toThrow(ConflictException);
  });

  it('allows cancelling a DRAFT order', async () => {
    const po = createFakePo({ status: 'DRAFT' });
    const prisma = createPrismaMock(po);
    const service = createService(prisma);

    await service.cancel('po1');

    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'CANCELLED' } }));
  });
});
