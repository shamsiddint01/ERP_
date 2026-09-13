import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { StudentAttendanceService } from './student-attendance.service.js';

const LESSON_DATE = new Date('2026-09-14T13:00:00.000Z'); // a Monday

function fakeLesson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lesson1',
    groupId: 'group1',
    teacherEmployeeId: 'teacher1',
    branchId: 'branch1',
    scheduledStart: LESSON_DATE,
    scheduledEnd: new Date(LESSON_DATE.getTime() + 60 * 60 * 1000),
    status: 'SCHEDULED',
    ...overrides,
  };
}

function fakeEnrollment(overrides: Record<string, unknown> = {}) {
  return { id: 'enrollment1', studentId: 'student1', groupId: 'group1', startDate: new Date('2026-09-01'), endDate: null, status: 'ACTIVE', ...overrides };
}

function fakeAttendance(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att1',
    lessonId: 'lesson1',
    studentId: 'student1',
    enrollmentId: 'enrollment1',
    status: 'PRESENT',
    notes: null,
    markedByUserId: 'user1',
    markedAt: new Date(),
    student: { id: 'student1', studentCode: 'STU-1', fullName: 'Test Student' },
    lesson: { id: 'lesson1', groupId: 'group1', teacherEmployeeId: 'teacher1', scheduledStart: LESSON_DATE, group: { id: 'group1', name: 'Test Group' } },
    ...overrides,
  };
}

function createPrismaMock(overrides: Record<string, Record<string, unknown>> = {}) {
  // Merged one level deep per entity (not a flat spread) — a test overriding
  // e.g. `studentAttendance.findUnique` must not silently lose the default
  // `create`/`update`/`upsert`/`delete` mocks on that same entity.
  return {
    studentAttendance: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeAttendance(data))),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeAttendance(data))),
      upsert: vi.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) => Promise.resolve(fakeAttendance(create))),
      delete: vi.fn().mockResolvedValue(fakeAttendance()),
      groupBy: vi.fn().mockResolvedValue([]),
      ...overrides.studentAttendance,
    },
    lesson: {
      findUnique: vi.fn().mockResolvedValue(fakeLesson()),
      findMany: vi.fn().mockResolvedValue([]),
      ...overrides.lesson,
    },
    enrollment: {
      findFirst: vi.fn().mockResolvedValue(fakeEnrollment()),
      findMany: vi.fn().mockResolvedValue([fakeEnrollment()]),
      ...overrides.enrollment,
    },
    student: { findUnique: vi.fn().mockResolvedValue({ id: 'student1' }), ...overrides.student },
    studentGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'group1', name: 'Test Group', teacherEmployeeId: 'teacher1' }), ...overrides.studentGroup },
    user: { findUnique: vi.fn().mockResolvedValue({ employeeId: null }), ...overrides.user }, // default: not a teacher at all
    teacherProfile: { findUnique: vi.fn().mockResolvedValue(null), ...overrides.teacherProfile },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

const notifications = { notifyByPermission: vi.fn().mockResolvedValue(0) };

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  notifications.notifyByPermission.mockClear();
  return new StudentAttendanceService(prisma as never, notifications as never, new AuditEntityRegistryService());
}

const ACTOR = 'user1';

describe('StudentAttendanceService', () => {
  describe('create — eligibility validation', () => {
    it('rejects an unknown lessonId', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(null) } });
      await expect(createService(prisma).create({ lessonId: 'lesson1', studentId: 'student1', status: 'PRESENT' }, ACTOR)).rejects.toThrow(NotFoundException);
    });

    it('rejects marking attendance for a CANCELLED lesson', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson({ status: 'CANCELLED' })) } });
      await expect(createService(prisma).create({ lessonId: 'lesson1', studentId: 'student1', status: 'PRESENT' }, ACTOR)).rejects.toThrow(ConflictException);
    });

    it('rejects a student with no enrollment in the lesson\'s group', async () => {
      const prisma = createPrismaMock({ enrollment: { findFirst: vi.fn().mockResolvedValue(null) } });
      await expect(createService(prisma).create({ lessonId: 'lesson1', studentId: 'student1', status: 'PRESENT' }, ACTOR)).rejects.toThrow(BadRequestException);
    });

    it('rejects a student whose enrollment starts after the lesson date (query itself encodes this, but confirm the call shape)', async () => {
      const findFirst = vi.fn().mockResolvedValue(null);
      const prisma = createPrismaMock({ enrollment: { findFirst } });
      await expect(createService(prisma).create({ lessonId: 'lesson1', studentId: 'student1', status: 'PRESENT' }, ACTOR)).rejects.toThrow(BadRequestException);
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ studentId: 'student1', groupId: 'group1', status: { not: 'CANCELLED' } }) }),
      );
    });

    it('rejects a duplicate attendance record for the same lesson+student', async () => {
      const prisma = createPrismaMock({ studentAttendance: { findUnique: vi.fn().mockResolvedValue(fakeAttendance()) } });
      await expect(createService(prisma).create({ lessonId: 'lesson1', studentId: 'student1', status: 'PRESENT' }, ACTOR)).rejects.toThrow(ConflictException);
    });

    it('translates a P2002 race (two concurrent creates) into a friendly ConflictException', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' });
      const prisma = createPrismaMock({ studentAttendance: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockRejectedValue(p2002) } });
      await expect(createService(prisma).create({ lessonId: 'lesson1', studentId: 'student1', status: 'PRESENT' }, ACTOR)).rejects.toThrow(ConflictException);
    });

    it('creates a valid attendance record and resolves the enrollmentId', async () => {
      const create = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeAttendance(data)));
      const prisma = createPrismaMock({ studentAttendance: { findUnique: vi.fn().mockResolvedValue(null), create } });
      const result = await createService(prisma).create({ lessonId: 'lesson1', studentId: 'student1', status: 'PRESENT' }, ACTOR);
      expect(result).toMatchObject({ status: 'PRESENT' });
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ enrollmentId: 'enrollment1', markedByUserId: ACTOR }) }));
    });

    it('fires a STUDENT_ABSENT notification when marking ABSENT', async () => {
      const prisma = createPrismaMock({ studentAttendance: { findUnique: vi.fn().mockResolvedValue(null) } });
      await createService(prisma).create({ lessonId: 'lesson1', studentId: 'student1', status: 'ABSENT' }, ACTOR);
      expect(notifications.notifyByPermission).toHaveBeenCalledWith('student_attendance', 'EDIT', expect.objectContaining({ type: 'STUDENT_ABSENT' }));
    });

    it('does not fire any notification when marking PRESENT', async () => {
      const prisma = createPrismaMock({ studentAttendance: { findUnique: vi.fn().mockResolvedValue(null) } });
      await createService(prisma).create({ lessonId: 'lesson1', studentId: 'student1', status: 'PRESENT' }, ACTOR);
      expect(notifications.notifyByPermission).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws NotFoundException for a non-existent record', async () => {
      const prisma = createPrismaMock();
      await expect(createService(prisma).update('missing', { status: 'ABSENT' }, ACTOR)).rejects.toThrow(NotFoundException);
    });

    it('bumps markedAt/markedByUserId when status changes', async () => {
      const update = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeAttendance(data)));
      const prisma = createPrismaMock({
        studentAttendance: { findUnique: vi.fn().mockResolvedValue(fakeAttendance({ status: 'PRESENT' })), update },
      });
      await createService(prisma).update('att1', { status: 'ABSENT' }, 'user2');
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ markedByUserId: 'user2', markedAt: expect.any(Date) }) }));
    });

    it('does not touch markedAt/markedByUserId on a notes-only edit', async () => {
      const update = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeAttendance(data)));
      const prisma = createPrismaMock({
        studentAttendance: { findUnique: vi.fn().mockResolvedValue(fakeAttendance({ status: 'PRESENT' })), update },
      });
      await createService(prisma).update('att1', { notes: 'left early' }, 'user2');
      const data = update.mock.calls[0][0].data;
      expect(data.markedByUserId).toBeUndefined();
      expect(data.markedAt).toBeUndefined();
    });

    it('re-fires the notification when a correction changes status to ABSENT', async () => {
      const prisma = createPrismaMock({ studentAttendance: { findUnique: vi.fn().mockResolvedValue(fakeAttendance({ status: 'PRESENT' })) } });
      await createService(prisma).update('att1', { status: 'ABSENT' }, ACTOR);
      expect(notifications.notifyByPermission).toHaveBeenCalledWith('student_attendance', 'EDIT', expect.objectContaining({ type: 'STUDENT_ABSENT' }));
    });
  });

  describe('remove', () => {
    it('hard-deletes rather than transitioning a status', async () => {
      const del = vi.fn().mockResolvedValue(fakeAttendance());
      const prisma = createPrismaMock({ studentAttendance: { findUnique: vi.fn().mockResolvedValue(fakeAttendance()), delete: del } });
      await createService(prisma).remove('att1', ACTOR);
      expect(del).toHaveBeenCalledWith({ where: { id: 'att1' } });
    });

    it('throws NotFoundException for a non-existent record', async () => {
      const prisma = createPrismaMock();
      await expect(createService(prisma).remove('missing', ACTOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe('teacher scoping (RBAC row-level)', () => {
    function asTeacher(prisma: ReturnType<typeof createPrismaMock>, employeeId: string) {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ employeeId });
      (prisma.teacherProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ACTIVE' });
    }

    it('a teacher can mark attendance for their own lesson', async () => {
      const prisma = createPrismaMock({ studentAttendance: { findUnique: vi.fn().mockResolvedValue(null) } });
      asTeacher(prisma, 'teacher1'); // matches fakeLesson's teacherEmployeeId
      const result = await createService(prisma).create({ lessonId: 'lesson1', studentId: 'student1', status: 'PRESENT' }, 'teacher-user');
      expect(result).toBeDefined();
    });

    it('a teacher is forbidden from marking attendance for a lesson they do not teach', async () => {
      const prisma = createPrismaMock();
      asTeacher(prisma, 'some-other-teacher');
      await expect(createService(prisma).create({ lessonId: 'lesson1', studentId: 'student1', status: 'PRESENT' }, 'teacher-user')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('a non-teacher (e.g. a manager) is never scoped, even with an employeeId but no TeacherProfile', async () => {
      const prisma = createPrismaMock({ studentAttendance: { findUnique: vi.fn().mockResolvedValue(null) } });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ employeeId: 'manager-employee' });
      (prisma.teacherProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const result = await createService(prisma).create({ lessonId: 'lesson1', studentId: 'student1', status: 'PRESENT' }, 'manager-user');
      expect(result).toBeDefined();
    });

    it('an INACTIVE teacher profile is not scoped as a teacher (falls through to unscoped)', async () => {
      const prisma = createPrismaMock({ studentAttendance: { findUnique: vi.fn().mockResolvedValue(null) } });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ employeeId: 'former-teacher' });
      (prisma.teacherProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'INACTIVE' });
      const result = await createService(prisma).create({ lessonId: 'lesson1', studentId: 'student1', status: 'PRESENT' }, 'former-teacher-user');
      expect(result).toBeDefined();
    });

    it('findAll silently narrows a teacher\'s results to their own lessons rather than rejecting', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = createPrismaMock({ studentAttendance: { findMany, count: vi.fn().mockResolvedValue(0) } });
      asTeacher(prisma, 'teacher1');
      await createService(prisma).findAll({ page: 1, pageSize: 20, teacherEmployeeId: 'someone-else' }, 'teacher-user');
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ lesson: expect.objectContaining({ teacherEmployeeId: 'teacher1' }) }) }));
    });

    it('getGroupSummary forbids a teacher from viewing a foreign group', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'group1', name: 'G', teacherEmployeeId: 'someone-else' }) } });
      asTeacher(prisma, 'teacher1');
      await expect(createService(prisma).getGroupSummary('group1', {}, 'teacher-user')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('bulkMark', () => {
    const entries = [
      { studentId: 'student1', status: 'PRESENT' as const },
      { studentId: 'student2', status: 'ABSENT' as const },
    ];

    it('rejects duplicate studentIds within the same request', async () => {
      const prisma = createPrismaMock();
      await expect(
        createService(prisma).bulkMark('lesson1', [{ studentId: 'student1', status: 'PRESENT' }, { studentId: 'student1', status: 'ABSENT' }], ACTOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects the WHOLE batch (no partial result) when any student is ineligible', async () => {
      const prisma = createPrismaMock({
        enrollment: { findMany: vi.fn().mockResolvedValue([fakeEnrollment({ studentId: 'student1' })]) }, // student2 missing
      });
      const upsert = prisma.studentAttendance.upsert as ReturnType<typeof vi.fn>;
      await expect(createService(prisma).bulkMark('lesson1', entries, ACTOR)).rejects.toThrow(BadRequestException);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects the whole batch for a cancelled lesson', async () => {
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson({ status: 'CANCELLED' })) } });
      await expect(createService(prisma).bulkMark('lesson1', entries, ACTOR)).rejects.toThrow(ConflictException);
    });

    it('upserts every eligible entry inside one transaction', async () => {
      const prisma = createPrismaMock({
        enrollment: { findMany: vi.fn().mockResolvedValue([fakeEnrollment({ studentId: 'student1' }), fakeEnrollment({ studentId: 'student2', id: 'enrollment2' })]) },
      });
      const result = await createService(prisma).bulkMark('lesson1', entries, ACTOR);
      expect(prisma.studentAttendance.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.markedCount).toBe(2);
      expect(result.id).toBe('lesson1'); // for AuditInterceptor's entityId fallback
    });

    it('fires exactly one consolidated notification for the whole batch, not one per absent student', async () => {
      const manyAbsent = [
        { studentId: 'student1', status: 'ABSENT' as const },
        { studentId: 'student2', status: 'ABSENT' as const },
        { studentId: 'student3', status: 'ABSENT' as const },
      ];
      const prisma = createPrismaMock({
        enrollment: { findMany: vi.fn().mockResolvedValue(manyAbsent.map((e) => fakeEnrollment({ studentId: e.studentId, id: `e-${e.studentId}` }))) },
        lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson()), findMany: vi.fn().mockResolvedValue([]) },
      });
      await createService(prisma).bulkMark('lesson1', manyAbsent, ACTOR);
      const absentCalls = notifications.notifyByPermission.mock.calls.filter((c) => c[2].type === 'STUDENT_ABSENT');
      expect(absentCalls).toHaveLength(1);
    });
  });

  describe('getSummary', () => {
    it('computes markedAttendancePercentage counting LATE as attended', async () => {
      const prisma = createPrismaMock({
        studentAttendance: {
          groupBy: vi.fn().mockResolvedValue([
            { status: 'PRESENT', _count: { _all: 6 } },
            { status: 'LATE', _count: { _all: 2 } },
            { status: 'ABSENT', _count: { _all: 2 } },
          ]),
        },
      });
      const result = await createService(prisma).getSummary({ page: 1, pageSize: 20 }, ACTOR);
      expect(result).toMatchObject({ totalMarked: 10, present: 6, late: 2, absent: 2, excused: 0, markedAttendancePercentage: 80 });
    });
  });

  describe('getStudentSummary', () => {
    it('throws NotFoundException for a non-existent student', async () => {
      const prisma = createPrismaMock({ student: { findUnique: vi.fn().mockResolvedValue(null) } });
      await expect(createService(prisma).getStudentSummary('missing', {}, ACTOR)).rejects.toThrow(NotFoundException);
    });

    it('returns zeroed-out result when the student has no enrollments', async () => {
      const prisma = createPrismaMock({ enrollment: { findMany: vi.fn().mockResolvedValue([]) } });
      const result = await createService(prisma).getStudentSummary('student1', {}, ACTOR);
      expect(result).toMatchObject({ eligibleLessons: 0, attendancePercentage: 0 });
    });

    it('excludes CANCELLED lessons from eligibleLessons (they must not contribute to the percentage)', async () => {
      const lessonFindMany = vi.fn().mockResolvedValue([{ id: 'l1', scheduledStart: LESSON_DATE, topic: null, group: { id: 'g1', name: 'G', code: 'G1' } }]);
      const prisma = createPrismaMock({ lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson()), findMany: lessonFindMany } });
      await createService(prisma).getStudentSummary('student1', {}, ACTOR);
      expect(lessonFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { not: 'CANCELLED' } }) }));
    });

    it('counts LATE as attended and EXCUSED as not attended', async () => {
      const lessons = [
        { id: 'l1', scheduledStart: LESSON_DATE, topic: null, group: { id: 'g1', name: 'G', code: 'G1' } },
        { id: 'l2', scheduledStart: LESSON_DATE, topic: null, group: { id: 'g1', name: 'G', code: 'G1' } },
      ];
      const prisma = createPrismaMock({
        lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson()), findMany: vi.fn().mockResolvedValue(lessons) },
        studentAttendance: {
          findMany: vi.fn().mockResolvedValue([
            { lessonId: 'l1', status: 'LATE', notes: null, id: 'a1' },
            { lessonId: 'l2', status: 'EXCUSED', notes: null, id: 'a2' },
          ]),
        },
      });
      const result = await createService(prisma).getStudentSummary('student1', {}, ACTOR);
      expect(result).toMatchObject({ eligibleLessons: 2, late: 1, excused: 1, unmarked: 0, attendancePercentage: 50 });
    });

    it('treats an unmarked eligible lesson as not-attended (drags the percentage down, not excluded)', async () => {
      const lessons = [
        { id: 'l1', scheduledStart: LESSON_DATE, topic: null, group: { id: 'g1', name: 'G', code: 'G1' } },
        { id: 'l2', scheduledStart: LESSON_DATE, topic: null, group: { id: 'g1', name: 'G', code: 'G1' } },
      ];
      const prisma = createPrismaMock({
        lesson: { findUnique: vi.fn().mockResolvedValue(fakeLesson()), findMany: vi.fn().mockResolvedValue(lessons) },
        studentAttendance: { findMany: vi.fn().mockResolvedValue([{ lessonId: 'l1', status: 'PRESENT', notes: null, id: 'a1' }]) }, // l2 never marked
      });
      const result = await createService(prisma).getStudentSummary('student1', {}, ACTOR);
      expect(result).toMatchObject({ eligibleLessons: 2, present: 1, unmarked: 1, attendancePercentage: 50 });
      expect(result.records.find((r) => r.lessonId === 'l2')).toMatchObject({ status: 'UNMARKED' });
    });
  });

  describe('getGroupSummary', () => {
    it('throws NotFoundException for a non-existent group', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue(null) } });
      await expect(createService(prisma).getGroupSummary('missing', {}, ACTOR)).rejects.toThrow(NotFoundException);
    });

    it('returns one row per currently-enrolled student', async () => {
      const prisma = createPrismaMock({
        enrollment: {
          findMany: vi.fn().mockResolvedValue([
            fakeEnrollment({ studentId: 'student1', student: { id: 'student1', studentCode: 'S1', fullName: 'A' } }),
            fakeEnrollment({ studentId: 'student2', student: { id: 'student2', studentCode: 'S2', fullName: 'B' }, id: 'enrollment2' }),
          ]),
        },
      });
      const result = await createService(prisma).getGroupSummary('group1', {}, ACTOR);
      expect(result.students).toHaveLength(2);
    });
  });

  describe('findAll / findOne pagination and filters', () => {
    it('applies pagination', async () => {
      const prisma = createPrismaMock();
      await createService(prisma).findAll({ page: 2, pageSize: 5 }, ACTOR);
      expect(prisma.studentAttendance.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5 }));
    });

    it('applies the lesson-nested group/branch/date filters', async () => {
      const prisma = createPrismaMock();
      await createService(prisma).findAll({ page: 1, pageSize: 20, groupId: 'group1', branchId: 'branch1', dateFrom: '2026-09-01', dateTo: '2026-09-30' }, ACTOR);
      expect(prisma.studentAttendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ lesson: expect.objectContaining({ groupId: 'group1', branchId: 'branch1' }) }) }),
      );
    });

    it('findOne throws NotFoundException for a missing record', async () => {
      const prisma = createPrismaMock();
      await expect(createService(prisma).findOne('missing', ACTOR)).rejects.toThrow(NotFoundException);
    });
  });
});
