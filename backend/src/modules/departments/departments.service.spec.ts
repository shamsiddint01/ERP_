import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { DepartmentsService } from './departments.service.js';

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    department: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'dept1', ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'dept1', ...data })),
      ...(overrides.department as Record<string, unknown>),
    },
    employee: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      ...(overrides.employee as Record<string, unknown>),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new DepartmentsService(prisma as never, new AuditEntityRegistryService());
}

describe('DepartmentsService', () => {
  it('rejects creating a department with a duplicate code', async () => {
    const prisma = createPrismaMock({ department: { findUnique: vi.fn().mockResolvedValue({ id: 'existing', code: 'SALES' }) } });
    const service = createService(prisma);

    await expect(service.create({ name: 'Sales', code: 'SALES' })).rejects.toThrow(ConflictException);
  });

  it('rejects assigning a manager who does not belong to the department', async () => {
    const prisma = createPrismaMock({
      department: { findUnique: vi.fn().mockResolvedValue({ id: 'dept1', code: 'SALES' }) },
      employee: { findUnique: vi.fn().mockResolvedValue({ id: 'emp1', departmentId: 'other-dept', deletedAt: null }) },
    });
    const service = createService(prisma);

    await expect(service.update('dept1', { managerEmployeeId: 'emp1' })).rejects.toThrow(BadRequestException);
  });

  it('rejects deactivating a department that still has active employees', async () => {
    const prisma = createPrismaMock({
      department: { findUnique: vi.fn().mockResolvedValue({ id: 'dept1', code: 'SALES' }) },
      employee: { count: vi.fn().mockResolvedValue(2) },
    });
    const service = createService(prisma);

    await expect(service.update('dept1', { status: 'INACTIVE' })).rejects.toThrow(ConflictException);
  });

  it('allows deactivating a department with no active employees', async () => {
    const prisma = createPrismaMock({
      department: { findUnique: vi.fn().mockResolvedValue({ id: 'dept1', code: 'SALES' }) },
      employee: { count: vi.fn().mockResolvedValue(0) },
    });
    const service = createService(prisma);

    const result = await service.update('dept1', { status: 'INACTIVE' });
    expect(result).toMatchObject({ status: 'INACTIVE' });
  });
});
