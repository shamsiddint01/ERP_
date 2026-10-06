import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { StudentsService } from './students.service.js';

function fakeStudent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stu1',
    studentCode: 'STU-2026-000001',
    firstName: 'Aziz',
    lastName: 'Karimov',
    fullName: 'Aziz Karimov',
    status: 'ACTIVE',
    branchId: null,
    userId: null,
    ...overrides,
  };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  const txStub = {
    student: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(fakeStudent()),
    },
  };
  return {
    student: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeStudent(data))),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeStudent(data))),
      ...(overrides.student as Record<string, unknown>),
    },
    branch: {
      findUnique: vi.fn().mockResolvedValue({ id: 'branch1' }),
      ...(overrides.branch as Record<string, unknown>),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'user1' }),
      ...(overrides.user as Record<string, unknown>),
    },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)),
    __tx: txStub,
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new StudentsService(prisma as never, new AuditEntityRegistryService());
}

describe('StudentsService', () => {
  describe('create', () => {
    it('rejects when the branch does not exist', async () => {
      const prisma = createPrismaMock({ branch: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.create({ firstName: 'A', lastName: 'B', branchId: 'missing-branch' })).rejects.toThrow(NotFoundException);
    });

    it('rejects when the linked user account does not exist', async () => {
      const prisma = createPrismaMock({ user: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.create({ firstName: 'A', lastName: 'B', userId: 'missing-user' })).rejects.toThrow(NotFoundException);
    });

    it('rejects when the user account is already linked to another student', async () => {
      const prisma = createPrismaMock({
        student: { findUnique: vi.fn().mockResolvedValue(fakeStudent({ id: 'other-student', userId: 'user1' })) },
      });
      const service = createService(prisma);

      await expect(service.create({ firstName: 'A', lastName: 'B', userId: 'user1' })).rejects.toThrow(ConflictException);
    });

    it('rejects an explicit student code that is already in use', async () => {
      const prisma = createPrismaMock({
        student: { findUnique: vi.fn().mockResolvedValue(fakeStudent({ studentCode: 'STU-0001' })) },
      });
      const service = createService(prisma);

      await expect(service.create({ firstName: 'A', lastName: 'B', studentCode: 'STU-0001' })).rejects.toThrow(ConflictException);
    });

    it('auto-generates a studentCode in the STU-YYYY-NNNNNN format when none is supplied', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      const result = await service.create({ firstName: 'Aziz', lastName: 'Karimov' });

      expect((result as { studentCode: string }).studentCode).toMatch(/^STU-\d{4}-\d{6}$/);
      expect((result as { fullName: string }).fullName).toBe('Aziz Karimov');
    });
  });

  describe('update', () => {
    it('allows re-saving a student with its own already-linked userId (no false-positive conflict)', async () => {
      const prisma = createPrismaMock({
        student: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(fakeStudent({ id: 'stu1', userId: 'user1' })) // findOne() inside update()
            .mockResolvedValueOnce(fakeStudent({ id: 'stu1', userId: 'user1' })), // the "linked to another student" check
        },
      });
      const service = createService(prisma);

      await expect(service.update('stu1', { userId: 'user1' })).resolves.toBeTruthy();
      expect(prisma.student.update).toHaveBeenCalled();
    });

    it('rejects linking a userId already used by a different student', async () => {
      const prisma = createPrismaMock({
        student: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(fakeStudent({ id: 'stu1', userId: null }))
            .mockResolvedValueOnce(fakeStudent({ id: 'some-other-student', userId: 'user1' })),
        },
      });
      const service = createService(prisma);

      await expect(service.update('stu1', { userId: 'user1' })).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('sets status to INACTIVE instead of hard-deleting (no deletedAt column on Student)', async () => {
      const prisma = createPrismaMock({ student: { findUnique: vi.fn().mockResolvedValue(fakeStudent()) } });
      const service = createService(prisma);

      await service.remove('stu1');

      expect(prisma.student.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'stu1' }, data: { status: 'INACTIVE' } }));
    });

    it('throws NotFoundException for a non-existent student', async () => {
      const prisma = createPrismaMock({ student: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('applies status, branch and search filters to the where clause', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ status: 'ACTIVE', branchId: 'branch1', search: 'Aziz', page: 2, pageSize: 10 });

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            branchId: 'branch1',
            OR: expect.arrayContaining([{ firstName: { contains: 'Aziz', mode: 'insensitive' } }]),
          }),
          skip: 10,
          take: 10,
        }),
      );
    });
  });
});
