import 'dotenv/config';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditEntityRegistryService } from '../src/shared/audit/audit-entity-registry.service.js';
import { FinanceLedgerService } from '../src/shared/finance/finance-ledger.service.js';
import { JournalService } from '../src/shared/finance/journal.service.js';
import { AssessmentsService } from '../src/modules/exams/assessments.service.js';
import { ExamsService } from '../src/modules/exams/exams.service.js';
import { GradingScaleService } from '../src/shared/grading/grading-scale.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { PayrollCalculationService } from '../src/modules/payroll/payroll-calculation.service.js';
import { PayrollService } from '../src/modules/payroll/payroll.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Genuine backend coverage for Phase H — runs the REAL
 * ExamsService/AssessmentsService/PayrollCalculationService/PayrollService
 * against the REAL dev Postgres (no mocks): the DB's own unique constraint
 * for duplicate assessments, real enrollment/teacher-scope checks, and a
 * real payroll calculate -> approve -> pay round trip whose journal entries
 * are inspected for Debit=Credit. Every row is created under the `ZZH-`
 * prefix and removed in afterAll; JournalEntry rows are never deleted (see
 * the Phase G concurrency e2e suite for why — count()-based document
 * numbering breaks if history is deleted out from under it), only their
 * Account.currentBalance impact is reversed.
 */
const prisma = new PrismaService();
const registry = new AuditEntityRegistryService();
const journal = new JournalService(prisma);
const financeLedger = new FinanceLedgerService(prisma, journal);
const notifications = new NotificationsService(prisma);
const gradingScale = new GradingScaleService();
const examsService = new ExamsService(prisma, notifications, registry);
const assessmentsService = new AssessmentsService(prisma, gradingScale, registry);
const payrollCalculationService = new PayrollCalculationService(prisma);
const payrollService = new PayrollService(prisma, payrollCalculationService, financeLedger, notifications, registry);

const P = 'ZZH-';
const journalReferenceIds: string[] = [];

let branchId: string;
let courseId: string;
let groupAId: string; // taught by teacherA
let groupBId: string; // taught by teacherB
let studentEnrolledId: string; // enrolled in groupA
let studentNotEnrolledId: string;
let teacherAEmployeeId: string;
let teacherAUserId: string;
let adminUserId: string;
let payrollPeriodId: string;
const employeeIds: string[] = [];
const userIds: string[] = [];
const payrollIds: string[] = [];

async function makeTeacher(tag: string) {
  const employee = await prisma.employee.create({
    data: { employeeCode: `${P}EMP-${tag}`, firstName: 'Concurrency', lastName: tag, fullName: `Teacher ${tag}`, phone: `+99890${Math.floor(Math.random() * 9000000 + 1000000)}`, hireDate: new Date('2024-01-01'), status: 'ACTIVE' },
  });
  employeeIds.push(employee.id);
  await prisma.teacherProfile.create({ data: { employeeId: employee.id, status: 'ACTIVE', perLessonRate: '50000', perGroupRate: '400000' } });
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

  const openPeriod = await prisma.payrollPeriod.findFirstOrThrow({ where: { status: 'OPEN' } });
  payrollPeriodId = openPeriod.id;
});

afterAll(async () => {
  if (journalReferenceIds.length > 0) {
    const entries = await prisma.journalEntry.findMany({ where: { referenceId: { in: journalReferenceIds } }, include: { lines: true } });
    const accountIds = [...new Set(entries.flatMap((e) => e.lines.map((l) => l.accountId)))];
    const accounts = await prisma.account.findMany({ where: { id: { in: accountIds } } });
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const DEBIT_NORMAL = new Set(['ASSET', 'EXPENSE']);
    for (const entry of entries) {
      for (const line of entry.lines) {
        const account = accountById.get(line.accountId)!;
        const isDebitNormal = DEBIT_NORMAL.has(account.category);
        const delta = isDebitNormal ? Number(line.debit) - Number(line.credit) : Number(line.credit) - Number(line.debit);
        await prisma.account.update({ where: { id: account.id }, data: { currentBalance: { decrement: delta } } });
      }
    }
    // JournalEntry rows are deliberately left in place — see this file's own doc comment.
  }

  await prisma.assessment.deleteMany({ where: { exam: { courseId } } });
  await prisma.exam.deleteMany({ where: { courseId } });
  await prisma.payroll.deleteMany({ where: { id: { in: payrollIds } } });
  await prisma.employeeCompensation.deleteMany({ where: { employeeId: { in: employeeIds } } });
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

describe('Payroll integration — PER_LESSON teacher compensation, real Postgres, no mocks (Phase H)', () => {
  it('only counts COMPLETED lessons within the period — CANCELLED and out-of-period lessons are excluded', async () => {
    const period = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: payrollPeriodId } });

    // 3 COMPLETED lessons inside the period, 1 CANCELLED inside the period (must not count), 1 COMPLETED but outside the period (must not count).
    await prisma.lesson.createMany({
      data: [
        { groupId: groupAId, teacherEmployeeId: teacherAEmployeeId, branchId, scheduledStart: new Date(period.periodStart.getTime() + 86_400_000), scheduledEnd: new Date(period.periodStart.getTime() + 90_000_000), status: 'COMPLETED' },
        { groupId: groupAId, teacherEmployeeId: teacherAEmployeeId, branchId, scheduledStart: new Date(period.periodStart.getTime() + 2 * 86_400_000), scheduledEnd: new Date(period.periodStart.getTime() + 2 * 90_000_000), status: 'COMPLETED' },
        { groupId: groupAId, teacherEmployeeId: teacherAEmployeeId, branchId, scheduledStart: new Date(period.periodStart.getTime() + 3 * 86_400_000), scheduledEnd: new Date(period.periodStart.getTime() + 3 * 90_000_000), status: 'COMPLETED' },
        { groupId: groupAId, teacherEmployeeId: teacherAEmployeeId, branchId, scheduledStart: new Date(period.periodStart.getTime() + 4 * 86_400_000), scheduledEnd: new Date(period.periodStart.getTime() + 4 * 90_000_000), status: 'CANCELLED' },
        { groupId: groupAId, teacherEmployeeId: teacherAEmployeeId, branchId, scheduledStart: new Date(period.periodEnd.getTime() + 10 * 86_400_000), scheduledEnd: new Date(period.periodEnd.getTime() + 10 * 90_000_000), status: 'COMPLETED' },
      ],
    });

    await prisma.employeeCompensation.create({
      data: { employeeId: teacherAEmployeeId, baseSalary: '0', salaryType: 'PER_LESSON', effectiveFrom: new Date('2026-01-01'), createdByUserId: adminUserId },
    });

    const payroll = await payrollService.create(payrollPeriodId, teacherAEmployeeId, adminUserId);
    payrollIds.push(payroll.id);
    const calculated = await payrollCalculationService.calculate(payroll.id);

    // 3 COMPLETED-in-period lessons x 50,000 perLessonRate = 150,000. The CANCELLED and out-of-period COMPLETED lessons contribute nothing.
    expect(Number(calculated.baseAmount)).toBe(150000);
    expect(Number(calculated.netSalary)).toBe(150000);
  });

  it('approving then paying that payroll posts balanced journal entries (Debit=Credit) via JournalService/FinanceLedgerService', async () => {
    const payroll = await prisma.payroll.findFirstOrThrow({ where: { employeeId: teacherAEmployeeId, status: 'CALCULATED' } });

    const approved = await payrollService.approve(payroll.id, adminUserId);
    expect(approved.status).toBe('APPROVED');
    journalReferenceIds.push(approved.id);

    const paid = await payrollService.pay(payroll.id, { method: 'BANK_TRANSFER' } as never, adminUserId);
    expect(paid.status).toBe('PAID');

    const [approvalEntry, paymentEntry] = await Promise.all([
      prisma.journalEntry.findUniqueOrThrow({ where: { id: approved.approvalJournalEntryId! }, include: { lines: true } }),
      prisma.journalEntry.findUniqueOrThrow({ where: { id: paid.paymentJournalEntryId! }, include: { lines: true } }),
    ]);

    for (const entry of [approvalEntry, paymentEntry]) {
      const totalDebit = entry.lines.reduce((sum, l) => sum + Number(l.debit), 0);
      const totalCredit = entry.lines.reduce((sum, l) => sum + Number(l.credit), 0);
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBeGreaterThan(0);
    }
  });
});
