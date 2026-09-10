import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { CompensationService } from './compensation.service.js';

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  const txStub = {
    employeeCompensation: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'comp2', ...data })),
    },
  };
  return {
    employee: { findUnique: vi.fn().mockResolvedValue({ id: 'emp1', deletedAt: null, fullName: 'Aziz' }) },
    employeeCompensation: {
      findUnique: vi.fn().mockResolvedValue({ id: 'comp1' }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    payroll: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)),
    __tx: txStub,
    ...overrides,
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new CompensationService(prisma as never, new AuditEntityRegistryService());
}

describe('CompensationService', () => {
  describe('create', () => {
    it('rejects a non-existent employee', async () => {
      const prisma = createPrismaMock({ employee: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(
        service.create({ employeeId: 'missing', baseSalary: 1000, salaryType: 'MONTHLY', effectiveFrom: '2026-09-01' }, 'user1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('closes out the previously-current compensation record when creating a new one', async () => {
      const prisma = createPrismaMock();
      prisma.__tx.employeeCompensation.findFirst = vi.fn().mockResolvedValue({ id: 'comp1', effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), effectiveTo: null });
      const service = createService(prisma);

      await service.create({ employeeId: 'emp1', baseSalary: 12000000, salaryType: 'MONTHLY', effectiveFrom: '2026-09-01' }, 'user1');

      expect(prisma.__tx.employeeCompensation.update).toHaveBeenCalledWith({
        where: { id: 'comp1' },
        data: { effectiveTo: new Date('2026-08-31T00:00:00.000Z') },
      });
      expect(prisma.__tx.employeeCompensation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ baseSalary: 12000000 }) }),
      );
    });

    it('rejects a new compensation that would take effect before or on the current one started', async () => {
      const prisma = createPrismaMock();
      prisma.__tx.employeeCompensation.findFirst = vi.fn().mockResolvedValue({ id: 'comp1', effectiveFrom: new Date('2026-09-01T00:00:00.000Z'), effectiveTo: null });
      const service = createService(prisma);

      await expect(
        service.create({ employeeId: 'emp1', baseSalary: 1000, salaryType: 'MONTHLY', effectiveFrom: '2026-08-01' }, 'user1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('refuses to delete a compensation record that already has payroll history', async () => {
      const prisma = createPrismaMock({ payroll: { count: vi.fn().mockResolvedValue(1) } });
      const service = createService(prisma);

      await expect(service.remove('comp1')).rejects.toThrow(ConflictException);
    });

    it('allows deleting a compensation record with no payroll history', async () => {
      const prisma = createPrismaMock({ payroll: { count: vi.fn().mockResolvedValue(0) } });
      const service = createService(prisma);

      await expect(service.remove('comp1')).resolves.toEqual({ id: 'comp1' });
    });
  });
});
