import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { GroupsService } from './groups.service.js';

function fakeGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group1',
    code: 'ENG-A1-01',
    name: 'English A1',
    courseId: 'course1',
    branchId: 'branch1',
    classroomId: null,
    teacherEmployeeId: null,
    capacity: 12,
    status: 'ACTIVE',
    startDate: new Date('2026-09-01'),
    endDate: null,
    _count: { enrollments: 0 },
    ...overrides,
  };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  const txStub = {
    employee: { findUnique: vi.fn().mockResolvedValue({ id: 'emp1', deletedAt: null }) },
    $queryRaw: vi.fn().mockResolvedValue([{ status: 'ACTIVE' }]),
    studentGroup: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeGroup(data))),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeGroup(data))),
    },
    ...(overrides.tx as Record<string, unknown>),
  };
  return {
    studentGroup: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      ...(overrides.studentGroup as Record<string, unknown>),
    },
    course: { findUnique: vi.fn().mockResolvedValue({ id: 'course1' }), ...(overrides.course as Record<string, unknown>) },
    branch: { findUnique: vi.fn().mockResolvedValue({ id: 'branch1' }), ...(overrides.branch as Record<string, unknown>) },
    classroom: {
      findUnique: vi.fn().mockResolvedValue({ id: 'room1', branchId: 'branch1' }),
      ...(overrides.classroom as Record<string, unknown>),
    },
    enrollment: { count: vi.fn().mockResolvedValue(0), ...(overrides.enrollment as Record<string, unknown>) },
    user: { findUnique: vi.fn().mockResolvedValue({ employeeId: null }), ...(overrides.user as Record<string, unknown>) },
    teacherProfile: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }), ...(overrides.teacherProfile as Record<string, unknown>) },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)),
    __tx: txStub,
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new GroupsService(prisma as never, new AuditEntityRegistryService());
}

const validDto = { code: 'ENG-A1-02', name: 'English A1 Evening', courseId: 'course1', branchId: 'branch1', startDate: '2026-09-01' };

describe('GroupsService', () => {
  describe('create', () => {
    it('rejects an unknown courseId', async () => {
      const prisma = createPrismaMock({ course: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.create(validDto)).rejects.toThrow(NotFoundException);
    });

    it('rejects an unknown branchId', async () => {
      const prisma = createPrismaMock({ branch: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.create(validDto)).rejects.toThrow(NotFoundException);
    });

    it('rejects an unknown classroomId', async () => {
      const prisma = createPrismaMock({ classroom: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.create({ ...validDto, classroomId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('rejects a classroom that does not belong to the selected branch', async () => {
      const prisma = createPrismaMock({ classroom: { findUnique: vi.fn().mockResolvedValue({ id: 'room1', branchId: 'other-branch' }) } });
      const service = createService(prisma);

      await expect(service.create({ ...validDto, classroomId: 'room1' })).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate group code', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup()) } });
      const service = createService(prisma);

      await expect(service.create(validDto)).rejects.toThrow(ConflictException);
    });

    it('rejects an end date before the start date', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.create({ ...validDto, startDate: '2026-09-10', endDate: '2026-09-01' })).rejects.toThrow(BadRequestException);
    });

    it('rejects assigning a teacher with no active TeacherProfile', async () => {
      const prisma = createPrismaMock({ tx: { $queryRaw: vi.fn().mockResolvedValue([]) } });
      const service = createService(prisma);

      await expect(service.create({ ...validDto, teacherEmployeeId: 'emp1' })).rejects.toThrow(ConflictException);
    });

    it('rejects assigning an employee whose TeacherProfile is INACTIVE', async () => {
      const prisma = createPrismaMock({ tx: { $queryRaw: vi.fn().mockResolvedValue([{ status: 'INACTIVE' }]) } });
      const service = createService(prisma);

      await expect(service.create({ ...validDto, teacherEmployeeId: 'emp1' })).rejects.toThrow(ConflictException);
    });

    it('creates a group with a valid active teacher', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      const result = await service.create({ ...validDto, teacherEmployeeId: 'emp1' });
      expect(result).toMatchObject({ code: 'ENG-A1-02' });
    });
  });

  describe('update', () => {
    it('refuses to cancel a group that still has active enrollments', async () => {
      const prisma = createPrismaMock({
        studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup()) },
        enrollment: { count: vi.fn().mockResolvedValue(3) },
      });
      const service = createService(prisma);

      await expect(service.update('group1', { status: 'CANCELLED' })).rejects.toThrow(ConflictException);
    });

    it('allows cancelling a group with no active enrollments', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup()) } });
      const service = createService(prisma);

      const result = await service.update('group1', { status: 'CANCELLED' });
      expect(result).toMatchObject({ status: 'CANCELLED' });
    });
  });

  describe('remove', () => {
    it('cancels instead of hard-deleting', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup()) } });
      const service = createService(prisma);

      const result = await service.remove('group1');
      expect(result).toMatchObject({ status: 'CANCELLED' });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a non-existent group', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('derives enrolledCount and availableSeats from the real enrollment count', async () => {
      const prisma = createPrismaMock({
        studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup({ capacity: 20, _count: { enrollments: 14 } })) },
      });
      const service = createService(prisma);

      const result = await service.findOne('group1');
      expect(result).toMatchObject({ enrolledCount: 14, availableSeats: 6 });
    });
  });

  describe('findAll', () => {
    it('applies filters, search and safe sorting', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ courseId: 'course1', branchId: 'branch1', status: 'ACTIVE', search: 'A1', sortBy: 'capacity', sortDir: 'asc', page: 1, pageSize: 20 }, 'user1');

      expect(prisma.studentGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ courseId: 'course1', branchId: 'branch1', status: 'ACTIVE' }),
          orderBy: { capacity: 'asc' },
        }),
      );
    });

    it('falls back to the default sort field for an unknown sortBy', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ sortBy: 'notARealColumn', page: 1, pageSize: 20 }, 'user1');

      expect(prisma.studentGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { startDate: 'desc' } }));
    });

    it("(Phase K) narrows to the teacher's own groups, silently overriding any teacherEmployeeId query param they pass", async () => {
      const prisma = createPrismaMock({ user: { findUnique: vi.fn().mockResolvedValue({ employeeId: 'teacherA-emp' }) } });
      const service = createService(prisma);

      await service.findAll({ teacherEmployeeId: 'someone-elses-emp', page: 1, pageSize: 20 }, 'teacherA-user');

      expect(prisma.studentGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ teacherEmployeeId: 'teacherA-emp' }) }));
    });

    it('(Phase K) does not narrow a non-teacher caller — their own teacherEmployeeId filter (or none) passes through untouched', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ page: 1, pageSize: 20 }, 'manager-user');

      expect(prisma.studentGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ teacherEmployeeId: undefined }) }));
    });
  });
});
