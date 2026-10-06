import 'dotenv/config';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditEntityRegistryService } from '../src/shared/audit/audit-entity-registry.service.js';
import { AssessmentsService } from '../src/modules/exams/assessments.service.js';
import { ExamsService } from '../src/modules/exams/exams.service.js';
import { GradingScaleService } from '../src/shared/grading/grading-scale.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Genuine backend coverage for exams — runs the REAL
 * ExamsService/AssessmentsService against the REAL dev Postgres (no mocks):
 * the DB's own unique constraint for duplicate assessments and real
 * enrollment/teacher-scope checks. Every row is created under the `ZZH-`
 * prefix and removed in afterAll.
 */
const prisma = new PrismaService();
const registry = new AuditEntityRegistryService();
const notifications = new NotificationsService(prisma);
const gradingScale = new GradingScaleService();
const examsService = new ExamsService(prisma, notifications, registry);
const assessmentsService = new AssessmentsService(prisma, gradingScale, registry);

const P = 'ZZH-';

let branchId: string;
let courseId: string;
let groupAId: string; // taught by teacherA
let groupBId: string; // taught by teacherB
let studentEnrolledId: string; // enrolled in groupA
let studentNotEnrolledId: string;
let teacherAEmployeeId: string;
let teacherAUserId: string;
let adminUserId: string;
const employeeIds: string[] = [];
const userIds: string[] = [];

async function makeTeacher(tag: string) {
  const employee = await prisma.employee.create({
    data: { employeeCode: `${P}EMP-${tag}`, firstName: 'Concurrency', lastName: tag, fullName: `Teacher ${tag}`, phone: `+99890${Math.floor(Math.random() * 9000000 + 1000000)}`, hireDate: new Date('2024-01-01'), status: 'ACTIVE' },
  });
  employeeIds.push(employee.id);
  await prisma.teacherProfile.create({ data: { employeeId: employee.id, status: 'ACTIVE' } });
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { name: 'Teacher' } });
  const user = await prisma.user.create({
    data: {
      fullName: `Teacher ${tag}`,
      email: `${P.toLowerCase()}${tag.toLowerCase()}@example.test`,
      username: `${P.toLowerCase()}${tag.toLowerCase()}`,
      passwordHash: 'x',
      roleId: teacherRole.id,
      employeeId: employee.id,
      status: 'ACTIVE',
    },
  });
  userIds.push(user.id);
  return { employeeId: employee.id, userId: user.id };
}

beforeAll(async () => {
  const branch = await prisma.branch.create({ data: { code: `${P}BR`, name: 'Phase H Branch' } });
  branchId = branch.id;
  const course = await prisma.course.create({ data: { code: `${P}CRS`, name: 'Phase H Course', defaultTuition: '500000', status: 'ACTIVE' } });
  courseId = course.id;

  const teacherA = await makeTeacher('A');
  teacherAEmployeeId = teacherA.employeeId;
  teacherAUserId = teacherA.userId;
  const teacherB = await makeTeacher('B');

  const groupA = await prisma.studentGroup.create({
    data: { code: `${P}GRP-A`, name: 'Phase H Group A', courseId, branchId, teacherEmployeeId: teacherAEmployeeId, capacity: 10, startDate: new Date('2026-09-01'), status: 'ACTIVE' },
  });
  groupAId = groupA.id;
  const groupB = await prisma.studentGroup.create({
    data: { code: `${P}GRP-B`, name: 'Phase H Group B', courseId, branchId, teacherEmployeeId: teacherB.employeeId, capacity: 10, startDate: new Date('2026-09-01'), status: 'ACTIVE' },
  });
  groupBId = groupB.id;

  const studentEnrolled = await prisma.student.create({
    data: { studentCode: `${P}STU-EN`, firstName: 'Enrolled', lastName: 'Student', fullName: 'Enrolled Student', branchId, status: 'ACTIVE' },
  });
  studentEnrolledId = studentEnrolled.id;
  await prisma.enrollment.create({ data: { studentId: studentEnrolledId, groupId: groupAId, startDate: new Date('2026-09-01'), status: 'ACTIVE' } });

  const studentNotEnrolled = await prisma.student.create({
    data: { studentCode: `${P}STU-NE`, firstName: 'NotEnrolled', lastName: 'Student', fullName: 'Not Enrolled Student', branchId, status: 'ACTIVE' },
  });
  studentNotEnrolledId = studentNotEnrolled.id;

  const admin = await prisma.user.findFirstOrThrow({ where: { username: 'admin' }, select: { id: true } });
  adminUserId = admin.id;
});

afterAll(async () => {
  await prisma.assessment.deleteMany({ where: { exam: { courseId } } });
  await prisma.exam.deleteMany({ where: { courseId } });
  await prisma.lesson.deleteMany({ where: { groupId: { in: [groupAId, groupBId] } } });
  await prisma.enrollment.deleteMany({ where: { groupId: { in: [groupAId, groupBId] } } });
  await prisma.student.deleteMany({ where: { id: { in: [studentEnrolledId, studentNotEnrolledId] } } });
  await prisma.studentGroup.deleteMany({ where: { id: { in: [groupAId, groupBId] } } });
  await prisma.course.deleteMany({ where: { id: courseId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.teacherProfile.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

describe('Exams/Assessments — real Postgres, no mocks (Phase H)', () => {
  it('rejects a duplicate (exam, student) assessment via the real DB unique constraint', async () => {
    const exam = await examsService.create(
      { title: 'Real DB Quiz', courseId, groupId: groupAId, teacherEmployeeId: teacherAEmployeeId, date: '2026-09-15T00:00:00.000Z', maxScore: 100, passingScore: 60, type: 'QUIZ' } as never,
      adminUserId,
    );

    await assessmentsService.create(exam.id, { studentId: studentEnrolledId, score: 75 } as never, adminUserId);
    await expect(assessmentsService.create(exam.id, { studentId: studentEnrolledId, score: 80 } as never, adminUserId)).rejects.toThrow(ConflictException);
  });

  it('rejects assessing a student who is not enrolled in the exam\'s group', async () => {
    const exam = await examsService.create(
      { title: 'Enrollment Check Quiz', courseId, groupId: groupAId, date: '2026-09-16T00:00:00.000Z', maxScore: 100, passingScore: 60, type: 'QUIZ' } as never,
      adminUserId,
    );

    await expect(assessmentsService.create(exam.id, { studentId: studentNotEnrolledId, score: 75 } as never, adminUserId)).rejects.toThrow(BadRequestException);
  });

  it('rejects a scoped teacher grading an exam that belongs to a group they do not teach (real TeacherProfile/User lookup)', async () => {
    const exam = await examsService.create(
      { title: 'Foreign Group Quiz', courseId, groupId: groupAId, teacherEmployeeId: teacherAEmployeeId, date: '2026-09-17T00:00:00.000Z', maxScore: 100, passingScore: 60, type: 'QUIZ' } as never,
      adminUserId,
    );

    // teacherB's own user account attempting to grade teacherA's group's exam.
    const teacherBUser = await prisma.user.findFirstOrThrow({ where: { username: `${P.toLowerCase()}b` } });
    await expect(assessmentsService.create(exam.id, { studentId: studentEnrolledId, score: 75 } as never, teacherBUser.id)).rejects.toThrow(ForbiddenException);
  });

  it('a teacher CAN grade their own group\'s exam', async () => {
    const exam = await examsService.create(
      { title: 'Own Group Quiz', courseId, groupId: groupAId, teacherEmployeeId: teacherAEmployeeId, date: '2026-09-18T00:00:00.000Z', maxScore: 100, passingScore: 60, type: 'QUIZ' } as never,
      adminUserId,
    );

    const assessment = await assessmentsService.create(exam.id, { studentId: studentEnrolledId, score: 88 } as never, teacherAUserId);
    // Decimal columns round-trip through the real driver as strings, unlike the mocked unit tests.
    expect(Number(assessment.score)).toBe(88);
    expect(Number(assessment.percentage)).toBe(88);
    expect(assessment.grade).toBe('B');
  });
});
