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
    studentGuardian: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
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
    guardian: {
      findUnique: vi.fn().mockResolvedValue({ id: 'guardian1', relationshipType: 'FATHER' }),
      ...(overrides.guardian as Record<string, unknown>),
    },
    studentGuardian: {
      findUnique: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...(overrides.studentGuardian as Record<string, unknown>),
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

  describe('addGuardian', () => {
    it('throws NotFoundException when the student does not exist', async () => {
      const prisma = createPrismaMock({ student: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.addGuardian('missing', { guardianId: 'g1' })).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the guardian does not exist', async () => {
      const prisma = createPrismaMock({
        student: { findUnique: vi.fn().mockResolvedValue(fakeStudent()) },
        guardian: { findUnique: vi.fn().mockResolvedValue(null) },
      });
      const service = createService(prisma);

      await expect(service.addGuardian('stu1', { guardianId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('rejects linking the same guardian to the same student twice', async () => {
      const prisma = createPrismaMock({
        student: { findUnique: vi.fn().mockResolvedValue(fakeStudent()) },
        studentGuardian: { findUnique: vi.fn().mockResolvedValue({ studentId: 'stu1', guardianId: 'g1' }) },
      });
      const service = createService(prisma);

      await expect(service.addGuardian('stu1', { guardianId: 'g1' })).rejects.toThrow(ConflictException);
    });

    it('unsets every other primary guardian before setting a new primary', async () => {
      const prisma = createPrismaMock({ student: { findUnique: vi.fn().mockResolvedValue(fakeStudent()) } });
      const service = createService(prisma);

      await service.addGuardian('stu1', { guardianId: 'g1', isPrimary: true });

      expect(prisma.__tx.studentGuardian.updateMany).toHaveBeenCalledWith({
        where: { studentId: 'stu1', isPrimary: true },
        data: { isPrimary: false },
      });
      expect(prisma.__tx.studentGuardian.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ studentId: 'stu1', guardianId: 'g1', isPrimary: true }) }),
      );
    });

    it('falls back to the guardian record relationshipType when no relationship override is given', async () => {
      const prisma = createPrismaMock({
        student: { findUnique: vi.fn().mockResolvedValue(fakeStudent()) },
        guardian: { findUnique: vi.fn().mockResolvedValue({ id: 'g1', relationshipType: 'MOTHER' }) },
      });
      const service = createService(prisma);

      await service.addGuardian('stu1', { guardianId: 'g1' });

      expect(prisma.__tx.studentGuardian.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ relationship: 'MOTHER' }) }),
      );
    });
  });

  describe('updateGuardianLink', () => {
    it('throws NotFoundException when the guardian is not linked to the student', async () => {
      const prisma = createPrismaMock({ studentGuardian: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.updateGuardianLink('stu1', 'g1', { isPrimary: true })).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeGuardian', () => {
    it('throws NotFoundException when there is nothing to unlink', async () => {
      const prisma = createPrismaMock({ studentGuardian: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } });
      const service = createService(prisma);

      await expect(service.removeGuardian('stu1', 'g1')).rejects.toThrow(NotFoundException);
    });
  });
});
