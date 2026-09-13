import 'dotenv/config';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditEntityRegistryService } from '../src/shared/audit/audit-entity-registry.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { StudentAttendanceService } from '../src/modules/student-attendance/student-attendance.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Genuine concurrency + transactional-integrity coverage for Phase F — runs
 * the REAL StudentAttendanceService against the REAL dev Postgres (no
 * mocks), mirroring prisma/enrollments-concurrency.e2e-spec.ts (Phase D) and
 * prisma/schedules-concurrency.e2e-spec.ts (Phase E). Every row is created
 * under the `ZZCONF-` prefix and removed in afterAll.
 */
const prisma = new PrismaService();
const registry = new AuditEntityRegistryService();
const notifications = new NotificationsService(prisma);
const attendanceService = new StudentAttendanceService(prisma, notifications, registry);
const P = 'ZZCONF-';

let branchId: string;
let courseId: string;
let groupId: string;
let studentIds: string[];
let actorUserId: string;

beforeAll(async () => {
  const branch = await prisma.branch.create({ data: { code: `${P}BR`, name: 'Concurrency Branch' } });
  branchId = branch.id;
  const course = await prisma.course.create({ data: { code: `${P}CRS`, name: 'Concurrency Course', defaultTuition: '500000', status: 'ACTIVE' } });
  courseId = course.id;
  const group = await prisma.studentGroup.create({
    data: { code: `${P}GRP`, name: 'Concurrency Group', courseId, branchId, capacity: 20, startDate: new Date('2026-09-01'), status: 'ACTIVE' },
  });
  groupId = group.id;

  const students = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      prisma.student.create({
        data: { studentCode: `${P}STU-${i}`, firstName: 'Concurrency', lastName: `Student${i}`, fullName: `Concurrency Student${i}`, branchId, status: 'ACTIVE' },
      }),
    ),
  );
  studentIds = students.map((s) => s.id);
  await Promise.all(studentIds.map((studentId) => prisma.enrollment.create({ data: { studentId, groupId, startDate: new Date('2026-09-01'), status: 'ACTIVE' } })));

  const admin = await prisma.user.findFirstOrThrow({ where: { username: 'admin' } });
  actorUserId = admin.id;
});

afterAll(async () => {
  await prisma.studentAttendance.deleteMany({ where: { student: { studentCode: { startsWith: P } } } });
  await prisma.enrollment.deleteMany({ where: { student: { studentCode: { startsWith: P } } } });
  await prisma.student.deleteMany({ where: { studentCode: { startsWith: P } } });
  await prisma.lesson.deleteMany({ where: { group: { code: { startsWith: P } } } });
  await prisma.studentGroup.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.course.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.branch.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.$disconnect();
});

async function makeLesson(suffix: string) {
  const lesson = await prisma.lesson.create({
    data: {
      groupId,
      branchId,
      scheduledStart: new Date(`2026-09-14T10:00:00.000Z`),
      scheduledEnd: new Date(`2026-09-14T11:00:00.000Z`),
      status: 'SCHEDULED',
      notes: suffix,
    },
  });
  return lesson.id;
}

describe('Student attendance concurrency (Phase F, real Postgres, no mocks)', () => {
  it('two simultaneous create() calls for the SAME lesson+student: exactly one succeeds, the other gets 409', async () => {
    const lessonId = await makeLesson('race-create');

    const results = await Promise.allSettled([
      attendanceService.create({ lessonId, studentId: studentIds[0], status: 'PRESENT' }, actorUserId),
      attendanceService.create({ lessonId, studentId: studentIds[0], status: 'ABSENT' }, actorUserId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const count = await prisma.studentAttendance.count({ where: { lessonId, studentId: studentIds[0] } });
    expect(count).toBe(1);
  });

  it('bulkMark rolls back the WHOLE batch when one entry is ineligible — no partial writes', async () => {
    const lessonId = await makeLesson('bulk-rollback');
    const outsider = await prisma.student.create({
      data: { studentCode: `${P}OUTSIDER`, firstName: 'Not', lastName: 'Enrolled', fullName: 'Not Enrolled', branchId, status: 'ACTIVE' },
    });

    await expect(
      attendanceService.bulkMark(
        lessonId,
        [
          { studentId: studentIds[0], status: 'PRESENT' },
          { studentId: studentIds[1], status: 'ABSENT' },
          { studentId: outsider.id, status: 'PRESENT' }, // not enrolled in this group
        ],
        actorUserId,
      ),
    ).rejects.toThrow(BadRequestException);

    const count = await prisma.studentAttendance.count({ where: { lessonId } });
    expect(count).toBe(0); // neither studentIds[0] nor studentIds[1] got written either

    await prisma.student.delete({ where: { id: outsider.id } });
  });

  it('bulkMark succeeds atomically for a fully-eligible batch', async () => {
    const lessonId = await makeLesson('bulk-success');

    const result = await attendanceService.bulkMark(
      lessonId,
      [
        { studentId: studentIds[0], status: 'PRESENT' },
        { studentId: studentIds[1], status: 'LATE' },
        { studentId: studentIds[2], status: 'ABSENT' },
      ],
      actorUserId,
    );

    expect(result.markedCount).toBe(3);
    const count = await prisma.studentAttendance.count({ where: { lessonId } });
    expect(count).toBe(3);
  });

  it('re-saving (bulkMark again) the same lesson corrects existing records instead of erroring as duplicates', async () => {
    const lessonId = await makeLesson('bulk-resave');
    await attendanceService.bulkMark(lessonId, [{ studentId: studentIds[0], status: 'ABSENT' }], actorUserId);

    // Teacher corrects the mark on a re-save.
    await attendanceService.bulkMark(lessonId, [{ studentId: studentIds[0], status: 'PRESENT' }], actorUserId);

    const records = await prisma.studentAttendance.findMany({ where: { lessonId, studentId: studentIds[0] } });
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('PRESENT');
  });

  it('cannot create attendance for a cancelled lesson', async () => {
    const lessonId = await makeLesson('cancelled');
    await prisma.lesson.update({ where: { id: lessonId }, data: { status: 'CANCELLED' } });

    await expect(attendanceService.create({ lessonId, studentId: studentIds[0], status: 'PRESENT' }, actorUserId)).rejects.toThrow();
  });

  it('a cancelled lesson never contributes to the student attendance percentage', async () => {
    const activeLessonId = await makeLesson('pct-active');
    const cancelledLessonId = await makeLesson('pct-cancelled');
    await attendanceService.create({ lessonId: activeLessonId, studentId: studentIds[3], status: 'PRESENT' }, actorUserId);
    await prisma.lesson.update({ where: { id: cancelledLessonId }, data: { status: 'CANCELLED' } });

    const summary = await attendanceService.getStudentSummary(studentIds[3], { groupId }, actorUserId);
    // Only the one ACTIVE lesson (with a PRESENT mark) should count — the
    // cancelled one must not appear in eligibleLessons at all.
    const eligibleIds = summary.records.map((r) => r.lessonId);
    expect(eligibleIds).not.toContain(cancelledLessonId);
    expect(eligibleIds).toContain(activeLessonId);
  });
});
