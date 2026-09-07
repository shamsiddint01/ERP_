import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { CustomersService } from './customers.service.js';

function createPrismaMock() {
  return {
    customer: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
    },
    order: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  const registry = new AuditEntityRegistryService();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new CustomersService(prisma as any, registry);
}

describe('CustomersService', () => {
  describe('remove', () => {
    it('refuses to deactivate a customer with an outstanding balance', async () => {
      const prisma = createPrismaMock();
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', deletedAt: null, balance: '150.00' });
      const service = createService(prisma);

      await expect(service.remove('c1')).rejects.toThrow(ConflictException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('soft-deletes a customer whose balance is zero', async () => {
      const prisma = createPrismaMock();
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', deletedAt: null, balance: '0' });
      prisma.customer.update.mockResolvedValue({ id: 'c1', status: 'INACTIVE' });
      const service = createService(prisma);

      await service.remove('c1');

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: expect.objectContaining({ status: 'INACTIVE' }),
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a soft-deleted customer', async () => {
      const prisma = createPrismaMock();
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', deletedAt: new Date() });
      const service = createService(prisma);

      await expect(service.findOne('c1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getHistory', () => {
    it('returns real (currently empty) relations rather than mock data', async () => {
      const prisma = createPrismaMock();
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', deletedAt: null });
      const service = createService(prisma);

      const history = await service.getHistory('c1');

      expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: 'c1' } }));
      expect(prisma.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { payerCustomerId: 'c1' } }));
      expect(history).toEqual({ orders: [], invoices: [], payments: [], activity: [] });
    });
  });
});
