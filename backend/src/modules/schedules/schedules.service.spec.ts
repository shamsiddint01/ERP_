import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { SchedulesService } from './schedules.service.js';

function fakeSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched1',
    groupId: 'group1',
    teacherEmployeeId: null,
    classroomId: null,
    branchId: 'branch1',
    dayOfWeek: 'MONDAY',
    startTime: '18:00',
    endTime: '19:30',
    startDate: new Date('2026-09-01'),
    endDate: null,
    recurrenceType: 'WEEKLY',
    status: 'ACTIVE',
    notes: null,
    ...overrides,
  };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  const txOverrides = (overrides.tx ?? {}) as { schedule?: Record<string, unknown>; employee?: Record<string, unknown>; $queryRaw?: unknown; $executeRaw?: unknown };
  const txStub = {
    employee: { findUnique: vi.fn().mockResolvedValue({ id: 'emp1', deletedAt: null }), ...txOverrides.employee },
    $queryRaw: txOverrides.$queryRaw ?? vi.fn().mockResolvedValue([{ status: 'ACTIVE' }]),
    $executeRaw: txOverrides.$executeRaw ?? vi.fn().mockResolvedValue(undefined),
    schedule: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeSchedule(data))),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeSchedule(data))),
      ...txOverrides.schedule,
    },
  };
  return {
    schedule: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      ...(overrides.schedule as Record<string, unknown>),
    },
    studentGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'group1', status: 'ACTIVE', branchId: 'branch1' }), ...(overrides.studentGroup as Record<string, unknown>) },
    branch: { findUnique: vi.fn().mockResolvedValue({ id: 'branch1' }), ...(overrides.branch as Record<string, unknown>) },
    classroom: {
      findUnique: vi.fn().mockResolvedValue({ id: 'room1', branchId: 'branch1' }),
      ...(overrides.classroom as Record<string, unknown>),
    },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)),
    __tx: txStub,
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new SchedulesService(prisma as never, new AuditEntityRegistryService());
}

const validDto = {
  groupId: 'group1',
  branchId: 'branch1',
  dayOfWeek: 'MONDAY' as const,
  startTime: '18:00',
  endTime: '19:30',
  startDate: '2026-09-01',
};

describe('SchedulesService', () => {
  describe('create — validation', () => {
    it('rejects an unknown groupId', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue(null) } });
      await expect(createService(prisma).create(validDto)).rejects.toThrow(NotFoundException);
    });

    it('rejects scheduling a COMPLETED group', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'group1', status: 'COMPLETED' }) } });
      await expect(createService(prisma).create(validDto)).rejects.toThrow(ConflictException);
    });

    it('rejects scheduling a CANCELLED group', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'group1', status: 'CANCELLED' }) } });
      await expect(createService(prisma).create(validDto)).rejects.toThrow(ConflictException);
    });

    it('rejects an unknown branchId', async () => {
      const prisma = createPrismaMock({ branch: { findUnique: vi.fn().mockResolvedValue(null) } });
      await expect(createService(prisma).create(validDto)).rejects.toThrow(NotFoundException);
    });

    it("rejects a branchId that does not match the group's own branch", async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'group1', status: 'ACTIVE', branchId: 'other-branch' }) } });
      await expect(createService(prisma).create(validDto)).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown classroomId', async () => {
      const prisma = createPrismaMock({ classroom: { findUnique: vi.fn().mockResolvedValue(null) } });
      await expect(createService(prisma).create({ ...validDto, classroomId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('rejects a classroom that does not belong to the selected branch', async () => {
      const prisma = createPrismaMock({ classroom: { findUnique: vi.fn().mockResolvedValue({ id: 'room1', branchId: 'other-branch' }) } });
      await expect(createService(prisma).create({ ...validDto, classroomId: 'room1' })).rejects.toThrow(BadRequestException);
    });

    it('rejects startTime not before endTime', async () => {
      const prisma = createPrismaMock();
      await expect(createService(prisma).create({ ...validDto, startTime: '19:30', endTime: '18:00' })).rejects.toThrow(BadRequestException);
    });

    it('rejects equal startTime and endTime', async () => {
      const prisma = createPrismaMock();
      await expect(createService(prisma).create({ ...validDto, startTime: '18:00', endTime: '18:00' })).rejects.toThrow(BadRequestException);
    });

    it('rejects an end date before the start date', async () => {
      const prisma = createPrismaMock();
      await expect(createService(prisma).create({ ...validDto, startDate: '2026-09-10', endDate: '2026-09-01' })).rejects.toThrow(BadRequestException);
    });

    it('rejects an invalid startDate', async () => {
      const prisma = createPrismaMock();
      await expect(createService(prisma).create({ ...validDto, startDate: 'not-a-date' })).rejects.toThrow(BadRequestException);
    });

    it('rejects assigning a teacher with no TeacherProfile at all', async () => {
      const prisma = createPrismaMock({ tx: { $queryRaw: vi.fn().mockResolvedValue([]) } });
      await expect(createService(prisma).create({ ...validDto, teacherEmployeeId: 'emp1' })).rejects.toThrow(ConflictException);
    });

    it('rejects assigning an employee whose TeacherProfile is INACTIVE', async () => {
      const prisma = createPrismaMock({ tx: { $queryRaw: vi.fn().mockResolvedValue([{ status: 'INACTIVE' }]) } });
      await expect(createService(prisma).create({ ...validDto, teacherEmployeeId: 'emp1' })).rejects.toThrow(ConflictException);
    });

    it('rejects an unknown/soft-deleted teacher employee', async () => {
      const prisma = createPrismaMock({ tx: { employee: { findUnique: vi.fn().mockResolvedValue(null) } } });
      await expect(createService(prisma).create({ ...validDto, teacherEmployeeId: 'emp1' })).rejects.toThrow(NotFoundException);
    });

    it('creates a schedule with a valid active teacher and classroom', async () => {
      const prisma = createPrismaMock();
      const result = await createService(prisma).create({ ...validDto, teacherEmployeeId: 'emp1', classroomId: 'room1' });
      expect(result).toMatchObject({ dayOfWeek: 'MONDAY', startTime: '18:00' });
    });

    it('skips collision/teacher checks entirely when creating directly as PAUSED', async () => {
      const prisma = createPrismaMock({ tx: { $queryRaw: vi.fn().mockResolvedValue([]) } }); // would fail teacher-active check if it ran
      const result = await createService(prisma).create({ ...validDto, teacherEmployeeId: 'emp1', status: 'PAUSED' });
      expect(result).toMatchObject({ status: 'PAUSED' });
    });
  });

  describe('create — collision detection', () => {
    it('rejects a teacher double-booked on the same day with an overlapping time window', async () => {
      const prisma = createPrismaMock({
        tx: {
          schedule: {
            findFirst: vi
              .fn()
              .mockResolvedValueOnce({ startTime: '17:30', endTime: '19:00', group: { name: 'Other Group' } }),
          },
        },
      });
      await expect(createService(prisma).create({ ...validDto, teacherEmployeeId: 'emp1' })).rejects.toThrow(ConflictException);
    });

    it('rejects a classroom double-booked on the same day with an overlapping time window', async () => {
      // No teacherEmployeeId on this dto, so assertNoCollision's teacher branch never runs —
      // the classroom check is the only (and therefore first) findFirst call.
      const prisma = createPrismaMock({
        tx: {
          schedule: {
            findFirst: vi.fn().mockResolvedValueOnce({ startTime: '19:00', endTime: '20:00', group: { name: 'Other Group' } }),
          },
        },
      });
      await expect(createService(prisma).create({ ...validDto, classroomId: 'room1' })).rejects.toThrow(ConflictException);
    });

    it('allows a back-to-back schedule (one ends exactly when the other starts)', async () => {
      const prisma = createPrismaMock();
      const result = await createService(prisma).create({ ...validDto, classroomId: 'room1', startTime: '19:30', endTime: '21:00' });
      expect(result).toMatchObject({ startTime: '19:30' });
    });

    it('does not collision-check a PAUSED or CANCELLED existing schedule (only ACTIVE ones are queried)', async () => {
      const findFirst = vi.fn().mockResolvedValue(null);
      const prisma = createPrismaMock({ tx: { schedule: { findFirst } } });
      await createService(prisma).create({ ...validDto, teacherEmployeeId: 'emp1', classroomId: 'room1' });
      for (const call of findFirst.mock.calls) {
        expect((call[0] as { where: { status: string } }).where.status).toBe('ACTIVE');
      }
    });
  });

  describe('update', () => {
    it('throws NotFoundException for a non-existent schedule', async () => {
      const prisma = createPrismaMock();
      await expect(createService(prisma).update('missing', { notes: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('allows pausing a schedule even if it would otherwise collide (collision is only checked while ACTIVE)', async () => {
      const prisma = createPrismaMock({
        schedule: { findUnique: vi.fn().mockResolvedValue(fakeSchedule()) },
        tx: { schedule: { findFirst: vi.fn().mockResolvedValue({ startTime: '00:00', endTime: '23:59', group: { name: 'Conflict' } }) } },
      });
      const result = await createService(prisma).update('sched1', { status: 'PAUSED' });
      expect(result).toMatchObject({ status: 'PAUSED' });
    });

    it('re-validates collision when re-activating a paused schedule', async () => {
      const prisma = createPrismaMock({
        schedule: { findUnique: vi.fn().mockResolvedValue(fakeSchedule({ status: 'PAUSED', teacherEmployeeId: 'emp1' })) },
        tx: { schedule: { findFirst: vi.fn().mockResolvedValue({ startTime: '17:30', endTime: '19:00', group: { name: 'Conflict' } }) } },
      });
      await expect(createService(prisma).update('sched1', { status: 'ACTIVE' })).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('cancels instead of hard-deleting', async () => {
      const prisma = createPrismaMock({ schedule: { findUnique: vi.fn().mockResolvedValue(fakeSchedule()) } });
      const result = await createService(prisma).remove('sched1');
      expect(result).toMatchObject({ status: 'CANCELLED' });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a non-existent schedule', async () => {
      const prisma = createPrismaMock();
      await expect(createService(prisma).findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('applies filters and pagination', async () => {
      const prisma = createPrismaMock();
      await createService(prisma).findAll({ groupId: 'group1', branchId: 'branch1', status: 'ACTIVE', page: 2, pageSize: 10 });

      expect(prisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ groupId: 'group1', branchId: 'branch1', status: 'ACTIVE' }),
          skip: 10,
          take: 10,
        }),
      );
    });

    it('defaults to day-of-week then start-time ordering when no sortBy is given', async () => {
      const prisma = createPrismaMock();
      await createService(prisma).findAll({ page: 1, pageSize: 20 });

      expect(prisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] }),
      );
    });

    it('honours an explicit, sortable sortBy/sortDir', async () => {
      const prisma = createPrismaMock();
      await createService(prisma).findAll({ sortBy: 'startDate', sortDir: 'desc', page: 1, pageSize: 20 });

      expect(prisma.schedule.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { startDate: 'desc' } }));
    });
  });
});
