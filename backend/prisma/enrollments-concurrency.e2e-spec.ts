import 'dotenv/config';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditEntityRegistryService } from '../src/shared/audit/audit-entity-registry.service.js';
import { EnrollmentsService } from '../src/modules/enrollments/enrollments.service.js';
import { GroupsService } from '../src/modules/groups/groups.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Genuine concurrency coverage for Phase D (§38/§46) — runs the REAL
 * EnrollmentsService against the REAL dev Postgres (no mocks), firing truly
 * parallel requests to prove the transaction-scoped advisory lock actually
 * serializes them. Every row is created under the `ZZCONC-` prefix and
 * removed in afterAll, so it never touches seed or production-like data.
 */
const prisma = new PrismaService();
const registry = new AuditEntityRegistryService();
const enrollmentsService = new EnrollmentsService(prisma, registry);
const groupsService = new GroupsService(prisma, registry);
const P = 'ZZCONC-';

let branchId: string;
let courseId: string;
let studentIds: string[];
let teacherEmployeeId: string;

async function makeGroup(code: string, capacity: number) {
  const group = await prisma.studentGroup.create({
    data: { code: `${P}${code}`, name: `Concurrency ${code}`, courseId, branchId, capacity, startDate: new Date('2026-09-01'), status: 'ACTIVE' },
  });
  return group.id;
}

beforeAll(async () => {
  const branch = await prisma.branch.create({ data: { code: `${P}BR`, name: 'Concurrency Branch' } });
  branchId = branch.id;
  const course = await prisma.course.create({ data: { code: `${P}CRS`, name: 'Concurrency Course', defaultTuition: '500000', status: 'ACTIVE' } });
  courseId = course.id;

  const students = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      prisma.student.create({
        data: { studentCode: `${P}STU-${i}`, firstName: 'Concurrency', lastName: `Student${i}`, fullName: `Concurrency Student${i}`, branchId, status: 'ACTIVE' },
      }),
    ),
  );
  studentIds = students.map((s) => s.id);

  const teacherEmployee = await prisma.employee.create({
    data: { employeeCode: `${P}EMP`, firstName: 'Concurrency', lastName: 'Teacher', fullName: 'Concurrency Teacher', phone: '+998900000099', hireDate: new Date('2024-01-01'), status: 'ACTIVE' },
  });
  teacherEmployeeId = teacherEmployee.id;
  await prisma.teacherProfile.create({ data: { employeeId: teacherEmployeeId, status: 'ACTIVE' } });
});

afterAll(async () => {
  await prisma.enrollment.deleteMany({ where: { student: { studentCode: { startsWith: P } } } });
  await prisma.student.deleteMany({ where: { studentCode: { startsWith: P } } });
  await prisma.studentGroup.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.course.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.teacherProfile.deleteMany({ where: { employee: { employeeCode: { startsWith: P } } } });
  await prisma.employee.deleteMany({ where: { employeeCode: { startsWith: P } } });
  await prisma.branch.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.$disconnect();
});

describe('Enrollment concurrency (Phase D §38/§46, real Postgres, no mocks)', () => {
  it('exactly one of two simultaneous enrollments into a 1-seat group succeeds; the other gets 409; capacity is never exceeded', async () => {
    const groupId = await makeGroup('CAP1', 1);

    const results = await Promise.allSettled([
      enrollmentsService.create({ studentId: studentIds[0], groupId }),
      enrollmentsService.create({ studentId: studentIds[1], groupId }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const activeCount = await prisma.enrollment.count({ where: { groupId, status: 'ACTIVE' } });
    expect(activeCount).toBe(1);
  });

  it('five simultaneous enrollments into a 2-seat group: exactly two succeed, three get 409, capacity never exceeded', async () => {
    const groupId = await makeGroup('CAP2', 2);
    const fiveStudents = studentIds.slice(0, 5);

    const results = await Promise.allSettled(fiveStudents.map((studentId) => enrollmentsService.create({ studentId, groupId })));

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(3);
    for (const r of rejected as PromiseRejectedResult[]) {
      expect(r.reason).toBeInstanceOf(ConflictException);
    }

    const activeCount = await prisma.enrollment.count({ where: { groupId, status: 'ACTIVE' } });
    expect(activeCount).toBe(2);
  });

  it('concurrent pause requests on the same enrollment: exactly one succeeds, the other gets 409', async () => {
    const groupId = await makeGroup('PAUSE', 5);
    const enrollment = await enrollmentsService.create({ studentId: studentIds[0], groupId });

    const results = await Promise.allSettled([enrollmentsService.pause(enrollment.id), enrollmentsService.pause(enrollment.id)]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const final = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(final.status).toBe('PAUSED');
  });

  it('concurrent transfer attempts of the same enrollment into two different groups: exactly one succeeds, no duplicate active target enrollment', async () => {
    const sourceGroupId = await makeGroup('XFER-SRC', 5);
    const targetGroupA = await makeGroup('XFER-A', 5);
    const targetGroupB = await makeGroup('XFER-B', 5);
    const enrollment = await enrollmentsService.create({ studentId: studentIds[0], groupId: sourceGroupId });

    const results = await Promise.allSettled([
      enrollmentsService.transfer(enrollment.id, { targetGroupId: targetGroupA }),
      enrollmentsService.transfer(enrollment.id, { targetGroupId: targetGroupB }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const activeInA = await prisma.enrollment.count({ where: { groupId: targetGroupA, status: 'ACTIVE' } });
    const activeInB = await prisma.enrollment.count({ where: { groupId: targetGroupB, status: 'ACTIVE' } });
    expect(activeInA + activeInB).toBe(1);

    const source = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(source.status).toBe('TRANSFERRED');
  });
});

describe('Group teacher-eligibility raw query (Phase D §8/§39, real Postgres, no mocks)', () => {
  it('assigns a real active TeacherProfile to a new group', async () => {
    const group = await groupsService.create({
      code: `${P}GRP-TEACH`,
      name: 'Concurrency Teacher Group',
      courseId,
      branchId,
      teacherEmployeeId,
      startDate: '2026-09-01',
    });
    expect(group.teacherEmployeeId).toBe(teacherEmployeeId);
  });

  it('rejects assigning an employee with no TeacherProfile at all', async () => {
    const bareEmployee = await prisma.employee.create({
      data: { employeeCode: `${P}EMP-BARE`, firstName: 'No', lastName: 'Profile', fullName: 'No Profile', phone: '+998900000098', hireDate: new Date('2024-01-01'), status: 'ACTIVE' },
    });

    await expect(
      groupsService.create({ code: `${P}GRP-NOPROFILE`, name: 'No Profile Group', courseId, branchId, teacherEmployeeId: bareEmployee.id, startDate: '2026-09-01' }),
    ).rejects.toThrow(ConflictException);

    await prisma.employee.delete({ where: { id: bareEmployee.id } });
  });
});
