import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { TeachersService } from './teachers.service.js';

function fakeProfile(overrides: Record<string, unknown> = {}) {
  return { id: 'profile1', employeeId: 'emp1', status: 'ACTIVE', specialization: 'IELTS', ...overrides };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    teacherProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeProfile(data))),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeProfile(data))),
      ...(overrides.teacherProfile as Record<string, unknown>),
    },
    employee: {
      findUnique: vi.fn().mockResolvedValue({ id: 'emp1', deletedAt: null, fullName: 'Test Teacher' }),
      ...(overrides.employee as Record<string, unknown>),
    },
    studentGroup: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      ...(overrides.studentGroup as Record<string, unknown>),
    },
    enrollment: { findMany: vi.fn().mockResolvedValue([]), ...(overrides.enrollment as Record<string, unknown>) },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new TeachersService(prisma as never, new AuditEntityRegistryService());
}

describe('TeachersService', () => {
  describe('create', () => {
    it('rejects an unknown employee', async () => {
      const prisma = createPrismaMock({ employee: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.create({ employeeId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('rejects a soft-deleted employee', async () => {
      const prisma = createPrismaMock({ employee: { findUnique: vi.fn().mockResolvedValue({ id: 'emp1', deletedAt: new Date() }) } });
      const service = createService(prisma);

      await expect(service.create({ employeeId: 'emp1' })).rejects.toThrow(NotFoundException);
    });

    it('rejects an employee who already has a teacher profile', async () => {
      const prisma = createPrismaMock({ teacherProfile: { findUnique: vi.fn().mockResolvedValue(fakeProfile()) } });
      const service = createService(prisma);

      await expect(service.create({ employeeId: 'emp1' })).rejects.toThrow(ConflictException);
    });

    it('creates a profile for a valid, unassigned employee', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      const result = await service.create({ employeeId: 'emp1', specialization: 'IELTS' });
      expect(result).toMatchObject({ employeeId: 'emp1', specialization: 'IELTS' });
    });
  });

  describe('update', () => {
    it('throws NotFoundException for a non-existent profile', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.update('missing', { status: 'INACTIVE' })).rejects.toThrow(NotFoundException);
    });

    it('refuses to deactivate a teacher who still has open groups', async () => {
      const prisma = createPrismaMock({
        teacherProfile: { findUnique: vi.fn().mockResolvedValue(fakeProfile()) },
        studentGroup: { count: vi.fn().mockResolvedValue(2) },
      });
      const service = createService(prisma);

      await expect(service.update('profile1', { status: 'INACTIVE' })).rejects.toThrow(ConflictException);
    });

    it('allows deactivating a teacher with no open groups', async () => {
      const prisma = createPrismaMock({ teacherProfile: { findUnique: vi.fn().mockResolvedValue(fakeProfile()) } });
      const service = createService(prisma);

      const result = await service.update('profile1', { status: 'INACTIVE' });
      expect(result).toMatchObject({ status: 'INACTIVE' });
    });
  });

  describe('remove', () => {
    it('deactivates instead of hard-deleting', async () => {
      const prisma = createPrismaMock({ teacherProfile: { findUnique: vi.fn().mockResolvedValue(fakeProfile()) } });
      const service = createService(prisma);

      const result = await service.remove('profile1');
      expect(result).toMatchObject({ status: 'INACTIVE' });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a non-existent profile', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('computes a real workload summary from groups and enrollments', async () => {
      const prisma = createPrismaMock({
        teacherProfile: { findUnique: vi.fn().mockResolvedValue(fakeProfile()) },
        studentGroup: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'g1', status: 'ACTIVE', _count: { enrollments: 5 } },
            { id: 'g2', status: 'COMPLETED', _count: { enrollments: 3 } },
          ]),
        },
        enrollment: {
          findMany: vi.fn().mockResolvedValue([{ studentId: 's1' }, { studentId: 's2' }, { studentId: 's3' }]),
        },
      });
      const service = createService(prisma);

      const result = await service.findOne('profile1');
      expect(result.workload).toEqual({ activeGroupsCount: 1, activeStudentsCount: 8, totalEnrolledStudents: 3 });
    });
  });

  describe('findAll', () => {
    it('combines department and branch filters without one clobbering the other', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ departmentId: 'dept1', branchId: 'branch1', page: 1, pageSize: 20 });

      expect(prisma.teacherProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employee: { departmentId: 'dept1', taughtGroups: { some: { branchId: 'branch1' } } },
          }),
        }),
      );
    });

    it('applies a search filter across employee fields and specialization', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ search: 'IELTS', page: 1, pageSize: 20 });

      expect(prisma.teacherProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.arrayContaining([{ specialization: { contains: 'IELTS', mode: 'insensitive' } }]) }),
        }),
      );
    });
  });
});
