import 'dotenv/config';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditEntityRegistryService } from '../src/shared/audit/audit-entity-registry.service.js';
import { LessonGenerationService } from '../src/modules/schedules/lesson-generation.service.js';
import { LessonsService } from '../src/modules/lessons/lessons.service.js';
import { SchedulesService } from '../src/modules/schedules/schedules.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Genuine concurrency coverage for Phase E — runs the REAL SchedulesService/
 * LessonsService/LessonGenerationService against the REAL dev Postgres (no
 * mocks), firing truly parallel requests to prove the transaction-scoped
 * advisory locks actually serialize them (mirrors
 * prisma/enrollments-concurrency.e2e-spec.ts from Phase D). Every row is
 * created under the `ZZCONE-` prefix and removed in afterAll, so it never
 * touches seed or production-like data.
 */
const prisma = new PrismaService();
const registry = new AuditEntityRegistryService();
const schedulesService = new SchedulesService(prisma, registry);
const lessonsService = new LessonsService(prisma, registry);
const lessonGenerationService = new LessonGenerationService(prisma);
const P = 'ZZCONE-';

let branchId: string;
let courseId: string;
let classroomAId: string;
let classroomBId: string;
let teacherAId: string;
let teacherBId: string;

async function makeGroup(code: string): Promise<string> {
  const group = await prisma.studentGroup.create({
    data: { code: `${P}${code}`, name: `Concurrency ${code}`, courseId, branchId, capacity: 10, startDate: new Date('2026-09-01'), status: 'ACTIVE' },
  });
  return group.id;
}

beforeAll(async () => {
  const branch = await prisma.branch.create({ data: { code: `${P}BR`, name: 'Concurrency Branch' } });
  branchId = branch.id;
  const course = await prisma.course.create({ data: { code: `${P}CRS`, name: 'Concurrency Course', defaultTuition: '500000', status: 'ACTIVE' } });
  courseId = course.id;

  const classroomA = await prisma.classroom.create({ data: { branchId, roomNumber: `${P}A`, name: 'Concurrency Room A', capacity: 20 } });
  classroomAId = classroomA.id;
  const classroomB = await prisma.classroom.create({ data: { branchId, roomNumber: `${P}B`, name: 'Concurrency Room B', capacity: 20 } });
  classroomBId = classroomB.id;

  const teacherA = await prisma.employee.create({
    data: { employeeCode: `${P}TCH-A`, firstName: 'Concurrency', lastName: 'TeacherA', fullName: 'Concurrency TeacherA', phone: '+998900000199', hireDate: new Date('2024-01-01'), status: 'ACTIVE' },
  });
  teacherAId = teacherA.id;
  await prisma.teacherProfile.create({ data: { employeeId: teacherAId, status: 'ACTIVE' } });

  const teacherB = await prisma.employee.create({
    data: { employeeCode: `${P}TCH-B`, firstName: 'Concurrency', lastName: 'TeacherB', fullName: 'Concurrency TeacherB', phone: '+998900000299', hireDate: new Date('2024-01-01'), status: 'ACTIVE' },
  });
  teacherBId = teacherB.id;
  await prisma.teacherProfile.create({ data: { employeeId: teacherBId, status: 'ACTIVE' } });
});

afterAll(async () => {
  await prisma.lesson.deleteMany({ where: { group: { code: { startsWith: P } } } });
  await prisma.schedule.deleteMany({ where: { group: { code: { startsWith: P } } } });
  await prisma.studentGroup.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.course.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.teacherProfile.deleteMany({ where: { employee: { employeeCode: { startsWith: P } } } });
  await prisma.employee.deleteMany({ where: { employeeCode: { startsWith: P } } });
  await prisma.classroom.deleteMany({ where: { roomNumber: { startsWith: P } } });
  await prisma.branch.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.$disconnect();
});

describe('Schedule concurrency (Phase E, real Postgres, no mocks)', () => {
  it('two simultaneous schedules for the SAME teacher + overlapping time: exactly one succeeds, the other gets 409', async () => {
    const [groupIdA, groupIdB] = await Promise.all([makeGroup('TCH-G1'), makeGroup('TCH-G2')]);

    const results = await Promise.allSettled([
      schedulesService.create({ groupId: groupIdA, branchId, teacherEmployeeId: teacherAId, dayOfWeek: 'MONDAY', startTime: '18:00', endTime: '19:30', startDate: '2026-09-01' }),
      schedulesService.create({ groupId: groupIdB, branchId, teacherEmployeeId: teacherAId, dayOfWeek: 'MONDAY', startTime: '18:30', endTime: '20:00', startDate: '2026-09-01' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const activeCount = await prisma.schedule.count({ where: { teacherEmployeeId: teacherAId, dayOfWeek: 'MONDAY', status: 'ACTIVE' } });
    expect(activeCount).toBe(1);
  });

  it('two simultaneous schedules for the SAME classroom + overlapping time (different teachers): exactly one succeeds', async () => {
    const [groupIdA, groupIdB] = await Promise.all([makeGroup('ROOM-G1'), makeGroup('ROOM-G2')]);

    const results = await Promise.allSettled([
      schedulesService.create({ groupId: groupIdA, branchId, classroomId: classroomAId, dayOfWeek: 'TUESDAY', startTime: '10:00', endTime: '11:00', startDate: '2026-09-01' }),
      schedulesService.create({ groupId: groupIdB, branchId, classroomId: classroomAId, dayOfWeek: 'TUESDAY', startTime: '10:30', endTime: '11:30', startDate: '2026-09-01' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const activeCount = await prisma.schedule.count({ where: { classroomId: classroomAId, dayOfWeek: 'TUESDAY', status: 'ACTIVE' } });
    expect(activeCount).toBe(1);
  });

  it('non-overlapping times for the same teacher on the same day both succeed (collision detection is not overly broad)', async () => {
    const [groupIdA, groupIdB] = await Promise.all([makeGroup('OK-G1'), makeGroup('OK-G2')]);

    const results = await Promise.allSettled([
      schedulesService.create({ groupId: groupIdA, branchId, teacherEmployeeId: teacherBId, dayOfWeek: 'WEDNESDAY', startTime: '09:00', endTime: '10:00', startDate: '2026-09-01' }),
      schedulesService.create({ groupId: groupIdB, branchId, teacherEmployeeId: teacherBId, dayOfWeek: 'WEDNESDAY', startTime: '10:00', endTime: '11:00', startDate: '2026-09-01' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  });

  it('five simultaneous schedule creations, all for the same teacher + fully overlapping slot: exactly one succeeds', async () => {
    const groupIds = await Promise.all(Array.from({ length: 5 }, (_, i) => makeGroup(`PILEUP-G${i}`)));

    const results = await Promise.allSettled(
      groupIds.map((groupId) =>
        schedulesService.create({ groupId, branchId, teacherEmployeeId: teacherBId, dayOfWeek: 'FRIDAY', startTime: '14:00', endTime: '15:00', startDate: '2026-09-01' }),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(4);
    const activeCount = await prisma.schedule.count({ where: { teacherEmployeeId: teacherBId, dayOfWeek: 'FRIDAY', status: 'ACTIVE' } });
    expect(activeCount).toBe(1);
  });
});

describe('Lesson generation idempotency (Phase E, real Postgres, no mocks)', () => {
  it('generating the same schedule twice with an overlapping range never creates duplicate lessons', async () => {
    const groupId = await makeGroup('GEN-G1');
    const schedule = await schedulesService.create({
      groupId,
      branchId,
      teacherEmployeeId: teacherAId,
      classroomId: classroomBId,
      dayOfWeek: 'SATURDAY',
      startTime: '12:00',
      endTime: '13:00',
      startDate: '2026-09-05',
    });

    const first = await lessonGenerationService.generateForSchedule(schedule.id, { fromDate: '2026-09-05', toDate: '2026-10-03' });
    expect(first.generatedCount).toBe(5); // Sep 5, 12, 19, 26, Oct 3

    const second = await lessonGenerationService.generateForSchedule(schedule.id, { fromDate: '2026-09-05', toDate: '2026-10-03' });
    expect(second.generatedCount).toBe(0);
    expect(second.skippedCount).toBe(5);

    const totalLessons = await prisma.lesson.count({ where: { scheduleId: schedule.id } });
    expect(totalLessons).toBe(5);
  });

  it('two concurrent generate calls for the same schedule never double-create (DB unique constraint + skipDuplicates)', async () => {
    const groupId = await makeGroup('GEN-G2');
    const schedule = await schedulesService.create({
      groupId,
      branchId,
      teacherEmployeeId: teacherBId,
      dayOfWeek: 'SUNDAY',
      startTime: '15:00',
      endTime: '16:00',
      startDate: '2026-09-06',
    });

    const [a, b] = await Promise.all([
      lessonGenerationService.generateForSchedule(schedule.id, { fromDate: '2026-09-06', toDate: '2026-09-27' }),
      lessonGenerationService.generateForSchedule(schedule.id, { fromDate: '2026-09-06', toDate: '2026-09-27' }),
    ]);

    expect(a.generatedCount + b.generatedCount).toBe(4); // Sep 6, 13, 20, 27 — created exactly once in total across both calls
    const totalLessons = await prisma.lesson.count({ where: { scheduleId: schedule.id } });
    expect(totalLessons).toBe(4);
  });
});

describe('Lesson concurrency (Phase E, real Postgres, no mocks)', () => {
  it('two concurrent manual lessons for the same teacher with an overlapping window: exactly one succeeds', async () => {
    const [groupIdA, groupIdB] = await Promise.all([makeGroup('LSN-G1'), makeGroup('LSN-G2')]);

    const results = await Promise.allSettled([
      lessonsService.create({ groupId: groupIdA, branchId, teacherEmployeeId: teacherAId, scheduledStart: '2026-10-10T10:00:00.000Z', scheduledEnd: '2026-10-10T11:00:00.000Z' }),
      lessonsService.create({ groupId: groupIdB, branchId, teacherEmployeeId: teacherAId, scheduledStart: '2026-10-10T10:30:00.000Z', scheduledEnd: '2026-10-10T11:30:00.000Z' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
  });

  it('concurrent start() calls on the same lesson: exactly one succeeds, the other gets 409', async () => {
    const groupId = await makeGroup('LSN-G3');
    const lesson = await lessonsService.create({ groupId, branchId, scheduledStart: '2026-10-11T10:00:00.000Z', scheduledEnd: '2026-10-11T11:00:00.000Z' });

    const results = await Promise.allSettled([lessonsService.start(lesson.id), lessonsService.start(lesson.id)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const final = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(final.status).toBe('IN_PROGRESS');
  });
});
