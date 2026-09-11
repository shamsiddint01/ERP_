import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { BranchesService } from './branches.service.js';

function fakeBranch(overrides: Record<string, unknown> = {}) {
  return { id: 'branch1', name: 'Main Branch', code: 'BR-MAIN', status: 'ACTIVE', ...overrides };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    branch: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeBranch(data))),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeBranch(data))),
      ...(overrides.branch as Record<string, unknown>),
    },
    employee: {
      findUnique: vi.fn().mockResolvedValue({ id: 'emp1', deletedAt: null }),
      ...(overrides.employee as Record<string, unknown>),
    },
    classroom: { count: vi.fn().mockResolvedValue(0), ...(overrides.classroom as Record<string, unknown>) },
    student: { count: vi.fn().mockResolvedValue(0), ...(overrides.student as Record<string, unknown>) },
    studentGroup: { count: vi.fn().mockResolvedValue(0), ...(overrides.studentGroup as Record<string, unknown>) },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new BranchesService(prisma as never, new AuditEntityRegistryService());
}

describe('BranchesService', () => {
  describe('create', () => {
    it('rejects an unknown managerEmployeeId', async () => {
      const prisma = createPrismaMock({ employee: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.create({ name: 'X', code: 'BR-X', managerEmployeeId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('rejects a soft-deleted managerEmployeeId', async () => {
      const prisma = createPrismaMock({ employee: { findUnique: vi.fn().mockResolvedValue({ id: 'emp1', deletedAt: new Date() }) } });
      const service = createService(prisma);

      await expect(service.create({ name: 'X', code: 'BR-X', managerEmployeeId: 'emp1' })).rejects.toThrow(NotFoundException);
    });

    it('rejects a duplicate branch code', async () => {
      const prisma = createPrismaMock({ branch: { findUnique: vi.fn().mockResolvedValue(fakeBranch()) } });
      const service = createService(prisma);

      await expect(service.create({ name: 'X', code: 'BR-MAIN' })).rejects.toThrow(ConflictException);
    });

    it('creates a branch when everything is valid', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      const result = await service.create({ name: 'Chilonzor Branch', code: 'BR-CHIL' });
      expect(result).toMatchObject({ name: 'Chilonzor Branch', code: 'BR-CHIL' });
    });
  });

  describe('update', () => {
    it('refuses to deactivate a branch that still has classrooms', async () => {
      const prisma = createPrismaMock({
        branch: { findUnique: vi.fn().mockResolvedValue(fakeBranch()) },
        classroom: { count: vi.fn().mockResolvedValue(2) },
      });
      const service = createService(prisma);

      await expect(service.update('branch1', { status: 'INACTIVE' })).rejects.toThrow(ConflictException);
    });

    it('refuses to deactivate a branch that still has students', async () => {
      const prisma = createPrismaMock({
        branch: { findUnique: vi.fn().mockResolvedValue(fakeBranch()) },
        student: { count: vi.fn().mockResolvedValue(5) },
      });
      const service = createService(prisma);

      await expect(service.update('branch1', { status: 'INACTIVE' })).rejects.toThrow(ConflictException);
    });

    it('refuses to deactivate a branch that still has student groups', async () => {
      const prisma = createPrismaMock({
        branch: { findUnique: vi.fn().mockResolvedValue(fakeBranch()) },
        studentGroup: { count: vi.fn().mockResolvedValue(1) },
      });
      const service = createService(prisma);

      await expect(service.update('branch1', { status: 'INACTIVE' })).rejects.toThrow(ConflictException);
    });

    it('allows deactivating a branch with no dependents', async () => {
      const prisma = createPrismaMock({ branch: { findUnique: vi.fn().mockResolvedValue(fakeBranch()) } });
      const service = createService(prisma);

      const result = await service.update('branch1', { status: 'INACTIVE' });
      expect(result).toMatchObject({ status: 'INACTIVE' });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a non-existent branch', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('includes a real activeGroupCount aggregate alongside the branch', async () => {
      const prisma = createPrismaMock({
        branch: { findUnique: vi.fn().mockResolvedValue({ ...fakeBranch(), classrooms: [] }) },
        studentGroup: { count: vi.fn().mockResolvedValue(3) },
      });
      const service = createService(prisma);

      const result = await service.findOne('branch1');
      expect(result).toMatchObject({ activeGroupCount: 3 });
    });
  });

  describe('findAll', () => {
    it('applies status filter and search across name/code/address/phone', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ status: 'ACTIVE', search: 'Chilon', page: 1, pageSize: 20 });

      expect(prisma.branch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            OR: expect.arrayContaining([{ name: { contains: 'Chilon', mode: 'insensitive' } }]),
          }),
        }),
      );
    });
  });
});
