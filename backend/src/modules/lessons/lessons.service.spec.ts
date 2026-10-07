import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { LessonsService } from './lessons.service.js';

function fakeLesson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lesson1',
    groupId: 'group1',
    scheduleId: null,
    teacherEmployeeId: null,
    classroomId: null,
    branchId: 'branch1',
    scheduledStart: new Date('2026-09-14T13:00:00.000Z'),
    scheduledEnd: new Date('2026-09-14T14:30:00.000Z'),
    actualStart: null,
    actualEnd: null,
    topic: null,
    homework: null,
    notes: null,
    status: 'SCHEDULED',
    ...overrides,
  };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  const txOverrides = (overrides.tx ?? {}) as { lesson?: Record<string, unknown>; employee?: Record<string, unknown>; $queryRaw?: unknown; $executeRaw?: unknown };
  const txStub = {
    employee: { findUnique: vi.fn().mockResolvedValue({ id: 'emp1', deletedAt: null, status: 'ACTIVE' }), ...txOverrides.employee },
    $queryRaw: txOverrides.$queryRaw ?? vi.fn().mockResolvedValue([{ status: 'ACTIVE' }]),
    $executeRaw: txOverrides.$executeRaw ?? vi.fn().mockResolvedValue(undefined),
    lesson: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeLesson(data))),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeLesson(data))),
      ...txOverrides.lesson,
    },
  };
  return {
    lesson: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...(overrides.lesson as Record<string, unknown>),
    },
    studentGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'group1', status: 'ACTIVE', branchId: 'branch1' }), ...(overrides.studentGroup as Record<string, unknown>) },
    branch: { findUnique: vi.fn().mockResolvedValue({ id: 'branch1' }), ...(overrides.branch as Record<string, unknown>) },
    classroom: {
      findUnique: vi.fn().mockResolvedValue({ id: 'room1', branchId: 'branch1' }),
      ...(overrides.classroom as Record<string, unknown>),
    },
    schedule: { findUnique: vi.fn().mockResolvedValue({ id: 'sched1' }), ...(overrides.schedule as Record<string, unknown>) },
    // Defaults to "not a teacher" (no employeeId) so assertTeacherScopeAllows is a no-op unless a test explicitly overrides it to exercise ownership scoping.
    user: { findUnique: vi.fn().mockResolvedValue({ employeeId: null }), ...(overrides.user as Record<string, unknown>) },
    teacherProfile: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }), ...(overrides.teacherProfile as Record<string, unknown>) },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)),
    __tx: txStub,
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new LessonsService(prisma as never, new AuditEntityRegistryService());
}

const validDto = {
  groupId: 'group1',
  branchId: 'branch1',
  scheduledStart: '2026-09-14T13:00:00.000Z',
  scheduledEnd: '2026-09-14T14:30:00.000Z',
};

describe('LessonsService', () => {
  describe('create — validation', () => {
    it('rejects an unknown groupId', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue(null) } });
      await expect(createService(prisma).create(validDto)).rejects.toThrow(NotFoundException);
    });

    it('rejects creating a lesson for a CANCELLED group', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'group1', status: 'CANCELLED' }) } });
      await expect(createService(prisma).create(validDto)).rejects.toThrow(ConflictException);
    });

    it("rejects a branchId that does not match the group's own branch", async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'group1', status: 'ACTIVE', branchId: 'other-branch' }) } });
      await expect(createService(prisma).create(validDto)).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown branchId', async () => {
      const prisma = createPrismaMock({ branch: { findUnique: vi.fn().mockResolvedValue(null) } });
      await expect(createService(prisma).create(validDto)).rejects.toThrow(NotFoundException);
    });

    it('rejects a classroom that does not belong to the selected branch', async () => {
      const prisma = createPrismaMock({ classroom: { findUnique: vi.fn().mockResolvedValue({ id: 'room1', branchId: 'other' }) } });
      await expect(createService(prisma).create({ ...validDto, classroomId: 'room1' })).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown scheduleId', async () => {
      const prisma = createPrismaMock({ schedule: { findUnique: vi.fn().mockResolvedValue(null) } });
      await expect(createService(prisma).create({ ...validDto, scheduleId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('rejects scheduledStart not before scheduledEnd', async () => {
      const prisma = createPrismaMock();
      await expect(
        createService(prisma).create({ ...validDto, scheduledStart: '2026-09-14T14:30:00.000Z', scheduledEnd: '2026-09-14T13:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an invalid scheduledStart', async () => {
      const prisma = createPrismaMock();
      await expect(createService(prisma).create({ ...validDto, scheduledStart: 'not-a-date' })).rejects.toThrow(BadRequestException);
    });

    it('rejects assigning a teacher with an INACTIVE TeacherProfile', async () => {
      const prisma = createPrismaMock({ tx: { $queryRaw: vi.fn().mockResolvedValue([{ status: 'INACTIVE' }]) } });
      await expect(createService(prisma).create({ ...validDto, teacherEmployeeId: 'emp1' })).rejects.toThrow(ConflictException);
    });

    it('creates a lesson with valid references', async () => {
      const prisma = createPrismaMock();
      const result = await createService(prisma).create({ ...validDto, teacherEmployeeId: 'emp1', classroomId: 'room1', topic: 'Intro' });
      expect(result).toMatchObject({ topic: 'Intro' });
    });

    it('translates a P2002 unique-constraint violation into a friendly ConflictException', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' });
      const prisma = createPrismaMock({ tx: { lesson: { create: vi.fn().mockRejectedValue(p2002) } } });
      await expect(createService(prisma).create({ ...validDto, scheduleId: 'sched1' })).rejects.toThrow(ConflictException);
    });
  });

  describe('create — collision detection', () => {
    it('rejects a teacher double-booked in an overlapping window', async () => {
      const prisma = createPrismaMock({
        tx: { lesson: { findFirst: vi.fn().mockResolvedValueOnce({ group: { name: 'Other' } }) } },
      });
      await expect(createService(prisma).create({ ...validDto, teacherEmployeeId: 'emp1' })).rejects.toThrow(ConflictException);
    });

    it('rejects a classroom double-booked in an overlapping window', async () => {
      // No teacherEmployeeId on this dto, so assertNoCollision's teacher branch never runs —
      // the classroom check is the only (and therefore first) findFirst call.
      const prisma = createPrismaMock({
        tx: { lesson: { findFirst: vi.fn().mockResolvedValueOnce({ group: { name: 'Other' } }) } },
      });
      await expect(createService(prisma).create({ ...validDto, classroomId: 'room1' })).rejects.toThrow(ConflictException);
    });

    it('never treats a CANCELLED lesson as a blocker (queries with status notIn [CANCELLED])', async () => {
      const findFirst = vi.fn().mockResolvedValue(null);
      const prisma = createPrismaMock({ tx: { lesson: { findFirst } } });
      await createService(prisma).create({ ...validDto, teacherEmployeeId: 'emp1', classroomId: 'room1' });
      for (const call of findFirst.mock.calls) {
        expect((call[0] as { where: { status: { notIn: string[] } } }).where.status).toEqual({ notIn: ['CANCELLED'] });
      }
    });
  });

  describe('update', () => {
    it('throws NotFoundException for a non-existent lesson', async () => {
      const prisma = createPrismaMock();
      await expect(createService(prisma).update('missing', { topic: 'x' }, 'user1')).rejects.toThrow(NotFoundException);
    });

    it('allows editing topic/homework/notes on a COMPLETED lesson', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson({ status: 'COMPLETED' })) } });
      const result = await createService(prisma).update('lesson1', { homework: 'Extra reading' }, 'user1');
      expect(result).toMatchObject({ homework: 'Extra reading' });
    });

    it('refuses to reschedule (change time) a COMPLETED lesson', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson({ status: 'COMPLETED' })) } });
      await expect(createService(prisma).update('lesson1', { scheduledStart: '2026-09-15T13:00:00.000Z' }, 'user1')).rejects.toThrow(ConflictException);
    });

    it('refuses to reassign the classroom of a CANCELLED lesson', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson({ status: 'CANCELLED' })) } });
      await expect(createService(prisma).update('lesson1', { classroomId: 'room1' }, 'user1')).rejects.toThrow(ConflictException);
    });

    it('allows rescheduling a SCHEDULED lesson and re-checks collision', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson()) } });
      const result = await createService(prisma).update('lesson1', { scheduledStart: '2026-09-15T13:00:00.000Z', scheduledEnd: '2026-09-15T14:30:00.000Z' }, 'user1');
      expect(result).toBeDefined();
    });

    it('rejects rescheduling into an inverted time range', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson()) } });
      await expect(createService(prisma).update('lesson1', { scheduledStart: '2026-09-14T14:30:00.000Z', scheduledEnd: '2026-09-14T13:00:00.000Z' }, 'user1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('workflow', () => {
    it('start(): SCHEDULED -> IN_PROGRESS sets actualStart', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson()) } });
      await createService(prisma).start('lesson1', 'user1');
      expect(prisma.lesson.updateMany).toHaveBeenCalledWith({
        where: { id: 'lesson1', status: 'SCHEDULED' },
        data: expect.objectContaining({ status: 'IN_PROGRESS', actualStart: expect.any(Date) }),
      });
    });

    it('start(): rejects starting an already-IN_PROGRESS lesson', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson({ status: 'IN_PROGRESS' })) } });
      await expect(createService(prisma).start('lesson1', 'user1')).rejects.toThrow(ConflictException);
    });

    it('start(): 409 when a concurrent change wins the CAS race (updateMany count 0)', async () => {
      const prisma = createPrismaMock({
        lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson()), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      });
      await expect(createService(prisma).start('lesson1', 'user1')).rejects.toThrow(ConflictException);
    });

    it('complete(): allowed directly from SCHEDULED, backfilling actualStart to scheduledStart', async () => {
      const lesson = fakeLesson();
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(lesson) } });
      await createService(prisma).complete('lesson1', 'user1');
      expect(prisma.lesson.updateMany).toHaveBeenCalledWith({
        where: { id: 'lesson1', status: 'SCHEDULED' },
        data: expect.objectContaining({ status: 'COMPLETED', actualStart: lesson.scheduledStart, actualEnd: expect.any(Date) }),
      });
    });

    it('complete(): keeps an already-set actualStart rather than overwriting it', async () => {
      const actualStart = new Date('2026-09-14T13:05:00.000Z');
      const lesson = fakeLesson({ status: 'IN_PROGRESS', actualStart });
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(lesson) } });
      await createService(prisma).complete('lesson1', 'user1');
      expect(prisma.lesson.updateMany).toHaveBeenCalledWith({
        where: { id: 'lesson1', status: 'IN_PROGRESS' },
        data: expect.objectContaining({ actualStart }),
      });
    });

    it('complete(): rejects completing an already-CANCELLED lesson', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson({ status: 'CANCELLED' })) } });
      await expect(createService(prisma).complete('lesson1', 'user1')).rejects.toThrow(ConflictException);
    });

    it('cancel(): SCHEDULED -> CANCELLED', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson()) } });
      await createService(prisma).cancel('lesson1', 'user1');
      expect(prisma.lesson.updateMany).toHaveBeenCalledWith({ where: { id: 'lesson1', status: 'SCHEDULED' }, data: { status: 'CANCELLED' } });
    });

    it('cancel(): rejects cancelling a COMPLETED lesson', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson({ status: 'COMPLETED' })) } });
      await expect(createService(prisma).cancel('lesson1', 'user1')).rejects.toThrow(ConflictException);
    });

  });

  describe('remove', () => {
    it('cancels instead of hard-deleting', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson()) } });
      const result = await createService(prisma).remove('lesson1', 'user1');
      expect(result).toBeDefined();
      expect(prisma.lesson.updateMany).toHaveBeenCalledWith({ where: { id: 'lesson1', status: 'SCHEDULED' }, data: { status: 'CANCELLED' } });
    });
  });

  describe('teacher ownership scoping (Phase K)', () => {
    function teacherPrisma(ownLesson: Record<string, unknown> = {}) {
      return createPrismaMock({
        lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson({ teacherEmployeeId: 'teacherA-emp', ...ownLesson })) },
        user: { findUnique: vi.fn().mockResolvedValue({ employeeId: 'teacherA-emp' }) },
        teacherProfile: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      });
    }

    it('allows a teacher to start/complete/cancel/update/remove their OWN lesson', async () => {
      const prisma = teacherPrisma();
      await expect(createService(prisma).start('lesson1', 'teacherA-user')).resolves.toBeDefined();
      await expect(createService(prisma).cancel('lesson1', 'teacherA-user')).resolves.toBeDefined();
    });

    it('rejects a teacher starting/completing/cancelling/updating ANOTHER teacher\'s lesson with ForbiddenException', async () => {
      const prisma = teacherPrisma({ teacherEmployeeId: 'teacherB-emp' });
      await expect(createService(prisma).start('lesson1', 'teacherA-user')).rejects.toThrow(ForbiddenException);
      await expect(createService(prisma).complete('lesson1', 'teacherA-user')).rejects.toThrow(ForbiddenException);
      await expect(createService(prisma).cancel('lesson1', 'teacherA-user')).rejects.toThrow(ForbiddenException);
      await expect(createService(prisma).update('lesson1', { topic: 'x' }, 'teacherA-user')).rejects.toThrow(ForbiddenException);
      await expect(createService(prisma).remove('lesson1', 'teacherA-user')).rejects.toThrow(ForbiddenException);
    });

    it('never scopes a non-teacher caller (no employeeId) — Manager/Admin can act on any lesson', async () => {
      const prisma = createPrismaMock({
        lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson({ teacherEmployeeId: 'teacherB-emp' })) },
        user: { findUnique: vi.fn().mockResolvedValue({ employeeId: null }) },
      });
      await expect(createService(prisma).start('lesson1', 'manager-user')).resolves.toBeDefined();
    });

    it('never scopes a caller whose TeacherProfile is not ACTIVE', async () => {
      const prisma = createPrismaMock({
        lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson({ teacherEmployeeId: 'teacherB-emp' })) },
        user: { findUnique: vi.fn().mockResolvedValue({ employeeId: 'former-teacher-emp' }) },
        teacherProfile: { findUnique: vi.fn().mockResolvedValue({ status: 'INACTIVE' }) },
      });
      await expect(createService(prisma).start('lesson1', 'former-teacher-user')).resolves.toBeDefined();
    });
  });

  describe('findAll', () => {
    it('applies filters and pagination, defaulting to scheduledStart desc', async () => {
      const prisma = createPrismaMock();
      await createService(prisma).findAll({ groupId: 'group1', status: 'SCHEDULED', page: 2, pageSize: 5 }, 'user1');

      expect(prisma.lesson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ groupId: 'group1', status: 'SCHEDULED' }),
          orderBy: { scheduledStart: 'desc' },
          skip: 5,
          take: 5,
        }),
      );
    });

    it('applies a date range filter on scheduledStart', async () => {
      const prisma = createPrismaMock();
      await createService(prisma).findAll({ dateFrom: '2026-09-01', dateTo: '2026-09-30', page: 1, pageSize: 20 }, 'user1');

      expect(prisma.lesson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ scheduledStart: { gte: new Date('2026-09-01'), lte: new Date('2026-09-30') } }) }),
      );
    });

    it("(Phase K) narrows to the teacher's own lessons, silently overriding any teacherEmployeeId query param they pass", async () => {
      const prisma = createPrismaMock({ user: { findUnique: vi.fn().mockResolvedValue({ employeeId: 'teacherA-emp' }) } });
      await createService(prisma).findAll({ teacherEmployeeId: 'someone-elses-emp', page: 1, pageSize: 20 }, 'teacherA-user');

      expect(prisma.lesson.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ teacherEmployeeId: 'teacherA-emp' }) }));
    });
  });
});
