import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { PositionsService } from './positions.service.js';

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    position: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pos1', ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pos1', ...data })),
      ...(overrides.position as Record<string, unknown>),
    },
    department: {
      findUnique: vi.fn().mockResolvedValue({ id: 'dept1' }),
      ...(overrides.department as Record<string, unknown>),
    },
    employee: {
      count: vi.fn().mockResolvedValue(0),
      ...(overrides.employee as Record<string, unknown>),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new PositionsService(prisma as never, new AuditEntityRegistryService());
}

describe('PositionsService', () => {
  it('rejects creating a position with a duplicate code', async () => {
    const prisma = createPrismaMock({ position: { findUnique: vi.fn().mockResolvedValue({ id: 'existing', code: 'SLS-MGR' }) } });
    const service = createService(prisma);

    await expect(service.create({ title: 'Sales Manager', code: 'SLS-MGR', departmentId: 'dept1' })).rejects.toThrow(ConflictException);
  });

  it('rejects creating a position for a non-existent department', async () => {
    const prisma = createPrismaMock({ department: { findUnique: vi.fn().mockResolvedValue(null) } });
    const service = createService(prisma);

    await expect(service.create({ title: 'Sales Manager', code: 'SLS-MGR', departmentId: 'missing' })).rejects.toThrow(NotFoundException);
  });

  it('rejects deactivating a position that still has active employees', async () => {
    const prisma = createPrismaMock({
      position: { findUnique: vi.fn().mockResolvedValue({ id: 'pos1', code: 'SLS-MGR' }) },
      employee: { count: vi.fn().mockResolvedValue(1) },
    });
    const service = createService(prisma);

    await expect(service.update('pos1', { status: 'INACTIVE' })).rejects.toThrow(ConflictException);
  });
});
