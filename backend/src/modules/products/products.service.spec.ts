import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { ProductsService } from './products.service.js';

function createPrismaMock(overrides: { existingProduct?: unknown } = {}) {
  return {
    product: {
      findFirst: vi.fn().mockResolvedValue(overrides.existingProduct ?? null),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-product', deletedAt: null, ...data })),
      update: vi.fn(),
    },
    inventoryStock: {
      groupBy: vi.fn().mockResolvedValue([]),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  const registry = new AuditEntityRegistryService();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ProductsService(prisma as any, registry);
}

describe('ProductsService', () => {
  describe('create', () => {
    it('throws ConflictException when the SKU is already taken', async () => {
      const prisma = createPrismaMock({ existingProduct: { id: 'other-product', sku: 'ABC-1' } });
      const service = createService(prisma);

      await expect(
        service.create({ name: 'Test', sku: 'ABC-1', salePrice: 10, costPrice: 5, unit: 'pcs' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('creates the product with ACTIVE status by default when the SKU is free', async () => {
      const prisma = createPrismaMock({ existingProduct: null });
      const service = createService(prisma);

      const product = await service.create({ name: 'Test', sku: 'ABC-2', salePrice: 10, costPrice: 5, unit: 'pcs' });

      expect(product).toMatchObject({ status: 'ACTIVE', sku: 'ABC-2' });
    });
  });

  describe('update', () => {
    it('allows a product to keep its own SKU (excludes itself from the uniqueness check)', async () => {
      const prisma = createPrismaMock({ existingProduct: null });
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', deletedAt: null, sku: 'ABC-1', minStockLevel: 0, inventoryStocks: [] });
      prisma.product.update.mockResolvedValue({ id: 'p1', sku: 'ABC-1', name: 'Renamed' });
      const service = createService(prisma);

      await service.update('p1', { sku: 'ABC-1', name: 'Renamed' });

      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { not: 'p1' } }) }),
      );
    });

    it('throws NotFoundException for a soft-deleted product', async () => {
      const prisma = createPrismaMock();
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', deletedAt: new Date() });
      const service = createService(prisma);

      await expect(service.update('p1', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne — computed stock status', () => {
    it('reports OUT_OF_STOCK when there is no inventory at all', async () => {
      const prisma = createPrismaMock();
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        deletedAt: null,
        minStockLevel: 10,
        inventoryStocks: [],
      });
      const service = createService(prisma);

      const result = await service.findOne('p1');
      expect(result.stockStatus).toBe('OUT_OF_STOCK');
      expect(result.totalStock).toBe(0);
    });

    it('reports LOW_STOCK when total stock is under the minimum', async () => {
      const prisma = createPrismaMock();
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        deletedAt: null,
        minStockLevel: 10,
        inventoryStocks: [{ quantityOnHand: 4 }],
      });
      const service = createService(prisma);

      const result = await service.findOne('p1');
      expect(result.stockStatus).toBe('LOW_STOCK');
    });

    it('reports HEALTHY when total stock clears the minimum', async () => {
      const prisma = createPrismaMock();
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        deletedAt: null,
        minStockLevel: 10,
        inventoryStocks: [{ quantityOnHand: 8 }, { quantityOnHand: 5 }],
      });
      const service = createService(prisma);

      const result = await service.findOne('p1');
      expect(result.stockStatus).toBe('HEALTHY');
      expect(result.totalStock).toBe(13);
    });
  });
});
