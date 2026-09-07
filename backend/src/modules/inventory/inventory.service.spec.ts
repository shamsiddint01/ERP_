import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { InventoryService } from './inventory.service.js';

function createFakeTx(overrides: {
  existingStock?: { id: string; quantityOnHand: number; version: number } | null;
  updateManyCount?: number;
}) {
  const existingStock = overrides.existingStock ?? null;
  const updateManyCount = overrides.updateManyCount ?? 1;

  return {
    inventoryStock: {
      findUnique: vi.fn().mockResolvedValue(existingStock),
      create: vi.fn().mockResolvedValue({ id: 'new-stock-id', quantityOnHand: 0, version: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: updateManyCount }),
    },
    stockMovement: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'movement-1', ...data })),
    },
  };
}

function createService(tx: ReturnType<typeof createFakeTx>) {
  const prisma = { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)) };
  const registry = new AuditEntityRegistryService();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new InventoryService(prisma as any, registry);
}

describe('InventoryService.adjustStock', () => {
  let service: InventoryService;

  describe('inbound movement (STOCK_IN) with no existing stock row', () => {
    let tx: ReturnType<typeof createFakeTx>;

    beforeEach(() => {
      tx = createFakeTx({ existingStock: null });
      service = createService(tx);
    });

    it('creates a new InventoryStock row starting from zero', async () => {
      await service.adjustStock({
        productId: 'p1',
        warehouseId: 'w1',
        movementType: 'STOCK_IN',
        quantity: 50,
        performedByUserId: 'u1',
      });

      expect(tx.inventoryStock.create).toHaveBeenCalledWith({
        data: { productId: 'p1', warehouseId: 'w1', quantityOnHand: 0 },
      });
    });

    it('records previousQuantity=0 and balanceAfter=quantity', async () => {
      const movement = await service.adjustStock({
        productId: 'p1',
        warehouseId: 'w1',
        movementType: 'STOCK_IN',
        quantity: 50,
        performedByUserId: 'u1',
      });

      expect(movement).toMatchObject({ previousQuantity: 0, balanceAfter: 50, quantity: 50 });
    });
  });

  describe('outbound movement (STOCK_OUT) with no existing stock row', () => {
    it('throws ConflictException instead of going negative', async () => {
      const tx = createFakeTx({ existingStock: null });
      service = createService(tx);

      await expect(
        service.adjustStock({ productId: 'p1', warehouseId: 'w1', movementType: 'STOCK_OUT', quantity: 10, performedByUserId: 'u1' }),
      ).rejects.toThrow(ConflictException);
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('outbound movement (STOCK_OUT) with insufficient existing stock', () => {
    it('throws ConflictException and does not write a movement', async () => {
      const tx = createFakeTx({ existingStock: { id: 's1', quantityOnHand: 5, version: 0 } });
      service = createService(tx);

      await expect(
        service.adjustStock({ productId: 'p1', warehouseId: 'w1', movementType: 'STOCK_OUT', quantity: 100, performedByUserId: 'u1' }),
      ).rejects.toThrow('Insufficient stock: available 5, requested 100');
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('outbound movement (STOCK_OUT) with sufficient stock', () => {
    it('decrements quantityOnHand and records the correct before/after balance', async () => {
      const tx = createFakeTx({ existingStock: { id: 's1', quantityOnHand: 100, version: 3 } });
      service = createService(tx);

      const movement = await service.adjustStock({
        productId: 'p1',
        warehouseId: 'w1',
        movementType: 'STOCK_OUT',
        quantity: 30,
        performedByUserId: 'u1',
      });

      expect(tx.inventoryStock.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', version: 3 },
        data: { quantityOnHand: 70, version: { increment: 1 } },
      });
      expect(movement).toMatchObject({ previousQuantity: 100, balanceAfter: 70, quantity: 30 });
    });
  });

  describe('concurrent modification', () => {
    it('throws ConflictException when the optimistic-lock version no longer matches', async () => {
      const tx = createFakeTx({ existingStock: { id: 's1', quantityOnHand: 100, version: 3 }, updateManyCount: 0 });
      service = createService(tx);

      await expect(
        service.adjustStock({ productId: 'p1', warehouseId: 'w1', movementType: 'STOCK_OUT', quantity: 10, performedByUserId: 'u1' }),
      ).rejects.toThrow('Stock was modified concurrently');
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });
  });
});
