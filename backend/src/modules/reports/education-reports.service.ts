import { BadRequestException, Injectable } from '@nestjs/common';
import { EnrollmentStatus, PaymentMethod, StudentGroupStatus, StudentStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicProgressService } from '../exams/academic-progress.service.js';
import type { EducationReportQueryDto } from './dto/education-report-query.dto.js';
import { ReportsService } from './reports.service.js';

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return round2((part / total) * 100);
}

/** End-of-day boundary so a `to` date includes everything that happened on that calendar day — mirrors ReportsService's own endOfDay. */
function endOfDay(date: string): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function dateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  return { gte: from ? new Date(from) : undefined, lte: to ? endOfDay(to) : undefined };
}

/** Validates a caller-supplied `status` string against the one enum that's actually meaningful for a given report, rather than silently ignoring a typo or letting an invalid value reach Prisma as a raw string. */
function assertEnumValue<T extends string>(value: string, enumObj: Record<string, T>, label: string): T {
  const allowed = Object.values(enumObj);
  if (!allowed.includes(value as T)) {
    throw new BadRequestException(`Invalid ${label}: "${value}" — expected one of ${allowed.join(', ')}`);
  }
  return value as T;
}

/**
 * Every /reports/education/* endpoint's real, live aggregation — no
 * hardcoded numbers anywhere in this file. Reuses ReportsService's existing
 * tuition methods, AcademicProgressService and StudentAttendanceService
 * (Phase F/G/H) rather than recomputing the same figures a second way;
 * CSV/PDF rendering reuses report-export.util.ts/ReportPdfService verbatim
 * (see EducationReportsController) — this file only ever produces plain
 * JSON-serializable data.
 */
@Injectable()
export class EducationReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
    private readonly academicProgress: AcademicProgressService,
  ) {}

  // ---------------------------------------------------------------------------
  // STUDENT REPORTS
  // ---------------------------------------------------------------------------

  async getStudentsReport(query: EducationReportQueryDto) {
    const status = query.status ? assertEnumValue(query.status, StudentStatus, 'student status') : undefined;
    const registrationDate = dateRange(query.from, query.to);

    // "students by branch/course/group" and "new students" all need to
    // honor the SAME course/group filter, which lives on Enrollment (a
    // Student itself has no courseId/groupId) — so every student-count here
    // is scoped through a `enrollments: { some: {...} }` clause when a
    // course/group filter is given, keeping every number in this report
    // consistent with the others.
    const enrollmentFilter: Prisma.EnrollmentWhereInput | undefined =
      query.courseId || query.groupId
        ? { status: { not: 'CANCELLED' }, groupId: query.groupId, group: query.courseId ? { courseId: query.courseId } : undefined }
        : undefined;

    const baseWhere: Prisma.StudentWhereInput = {
      branchId: query.branchId,
      registrationDate,
      ...(enrollmentFilter && { enrollments: { some: enrollmentFilter } }),
    };

    const [total, byStatusRaw, byBranchRaw] = await Promise.all([
      this.prisma.student.count({ where: { ...baseWhere, status } }),
      this.prisma.student.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
      this.prisma.student.groupBy({ by: ['branchId'], where: { ...baseWhere, status }, _count: { _all: true } }),
    ]);

    const byStatus = Object.fromEntries(Object.values(StudentStatus).map((s) => [s, 0])) as Record<StudentStatus, number>;
    for (const row of byStatusRaw) byStatus[row.status] = row._count._all;
    const activeStudents = byStatus.ACTIVE;
    const inactiveStudents = byStatus.INACTIVE + byStatus.LEFT;

    const branchIds = byBranchRaw.map((r) => r.branchId).filter((id): id is string => id !== null);
    const branches = branchIds.length ? await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }) : [];
    const branchById = new Map(branches.map((b) => [b.id, b.name]));
    const byBranch = byBranchRaw.map((r) => ({ branchId: r.branchId, branchName: r.branchId ? (branchById.get(r.branchId) ?? 'Unknown') : 'Unassigned', count: r._count._all }));

    // "By course"/"by group" count DISTINCT students (a student can hold more
    // than one enrollment), so this is bucketed from a light studentId+course
    // projection rather than counting enrollment rows.
    const enrollmentsForBucketing = await this.prisma.enrollment.findMany({
      where: { status: { not: 'CANCELLED' }, groupId: query.groupId, student: { branchId: query.branchId, status, registrationDate } },
      select: { studentId: true, group: { select: { id: true, name: true, courseId: true, course: { select: { id: true, name: true } } } } },
    });
    const byCourseMap = new Map<string, { courseName: string; students: Set<string> }>();
    const byGroupMap = new Map<string, { groupName: string; students: Set<string> }>();
    for (const e of enrollmentsForBucketing) {
      if (query.courseId && e.group.courseId !== query.courseId) continue;
      const course = byCourseMap.get(e.group.courseId) ?? { courseName: e.group.course.name, students: new Set<string>() };
      course.students.add(e.studentId);
      byCourseMap.set(e.group.courseId, course);
      const group = byGroupMap.get(e.group.id) ?? { groupName: e.group.name, students: new Set<string>() };
      group.students.add(e.studentId);
      byGroupMap.set(e.group.id, group);
    }
    const byCourse = [...byCourseMap.entries()].map(([courseId, v]) => ({ courseId, courseName: v.courseName, studentCount: v.students.size }));
    const byGroup = [...byGroupMap.entries()].map(([groupId, v]) => ({ groupId, groupName: v.groupName, studentCount: v.students.size }));

    // New students by period — bucketed by calendar month in JS from a
    // minimal {id, registrationDate} projection (never the full row), so
    // this stays cheap even for a school with years of history.
    const registrations = await this.prisma.student.findMany({ where: baseWhere, select: { registrationDate: true } });
    const byMonth = new Map<string, number>();
    for (const r of registrations) {
      const key = r.registrationDate.toISOString().slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }
    const newStudentsByPeriod = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, count]) => ({ period, count }));

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [enrollmentHistoryItems, enrollmentHistoryTotal] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: {
          groupId: query.groupId,
          status: query.status && this.isEnrollmentStatus(query.status) ? (query.status as EnrollmentStatus) : undefined,
          startDate: dateRange(query.from, query.to),
          student: { branchId: query.branchId, id: query.studentId },
          group: query.courseId ? { courseId: query.courseId } : undefined,
        },
        include: {
          student: { select: { id: true, studentCode: true, fullName: true } },
          group: { select: { id: true, name: true, code: true, course: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } } },
        },
        orderBy: { startDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.enrollment.count({
        where: {
          groupId: query.groupId,
          startDate: dateRange(query.from, query.to),
          student: { branchId: query.branchId, id: query.studentId },
          group: query.courseId ? { courseId: query.courseId } : undefined,
        },
      }),
    ]);

    return {
      totalStudents: status ? total : Object.values(byStatus).reduce((s, c) => s + c, 0),
      activeStudents,
      inactiveStudents,
      byStatus,
      byBranch,
      byCourse,
      byGroup,
      newStudentsByPeriod,
      enrollmentHistory: { items: enrollmentHistoryItems, total: enrollmentHistoryTotal, page, pageSize },
    };
  }

  private isEnrollmentStatus(value: string): value is EnrollmentStatus {
    return (Object.values(EnrollmentStatus) as string[]).includes(value);
  }

  // ---------------------------------------------------------------------------
  // GROUP REPORTS
  // ---------------------------------------------------------------------------

  async getGroupsReport(query: EducationReportQueryDto) {
    const status = query.status ? assertEnumValue(query.status, StudentGroupStatus, 'group status') : undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.StudentGroupWhereInput = {
      branchId: query.branchId,
      courseId: query.courseId,
      teacherEmployeeId: query.teacherEmployeeId,
      status,
    };

    const [groupCount, groups, groupsTotal] = await Promise.all([
      this.prisma.studentGroup.count({ where }),
      this.prisma.studentGroup.findMany({
        where,
        include: {
          course: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          teacherEmployee: { select: { id: true, fullName: true } },
          _count: { select: { enrollments: { where: { status: { not: 'CANCELLED' } } } } },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.studentGroup.count({ where }),
    ]);

    const groupIds = groups.map((g) => g.id);

    // Capacity utilization + student count, straight from the page we just fetched (never a second full-table scan).
    const capacityUtilization = groups.map((g) => ({
      groupId: g.id,
      name: g.name,
      code: g.code,
      capacity: g.capacity,
      enrolledCount: g._count.enrollments,
      utilizationPercentage: percentage(g._count.enrollments, g.capacity),
    }));
    const studentCount = capacityUtilization.reduce((sum, g) => sum + g.enrolledCount, 0);
    const averageUtilization = capacityUtilization.length ? round2(capacityUtilization.reduce((s, g) => s + g.utilizationPercentage, 0) / capacityUtilization.length) : 0;

    const teacherWorkloadMap = new Map<string, { teacherEmployeeId: string; name: string; groupsCount: number; studentsCount: number }>();
    for (const g of groups) {
      if (!g.teacherEmployeeId || !g.teacherEmployee) continue;
      const entry = teacherWorkloadMap.get(g.teacherEmployeeId) ?? { teacherEmployeeId: g.teacherEmployeeId, name: g.teacherEmployee.fullName, groupsCount: 0, studentsCount: 0 };
      entry.groupsCount += 1;
      entry.studentsCount += g._count.enrollments;
      teacherWorkloadMap.set(g.teacherEmployeeId, entry);
    }

    // Group performance — a direct aggregation (not AcademicProgressService.
    // getGroupResults): that method enforces "reject a foreign group" teacher
    // scoping meant for a single teacher checking their OWN class, which
    // would make a multi-group report reject its ENTIRE response the moment
    // any one group on the page belongs to a different teacher. This report
    // endpoint's own permission gate (`groups:VIEW`) is the right boundary
    // for an aggregate view across many groups at once.
    const assessmentsForPerf = groupIds.length
      ? await this.prisma.assessment.findMany({
          where: { exam: { groupId: { in: groupIds } } },
          select: { score: true, percentage: true, exam: { select: { groupId: true, passingScore: true } } },
        })
      : [];
    const perfByGroup = new Map<string, { scores: number[]; passingCount: number }>();
    for (const a of assessmentsForPerf) {
      const entry = perfByGroup.get(a.exam.groupId) ?? { scores: [], passingCount: 0 };
      entry.scores.push(Number(a.percentage));
      if (Number(a.score) >= Number(a.exam.passingScore)) entry.passingCount += 1;
      perfByGroup.set(a.exam.groupId, entry);
    }
    const groupPerformance = groups.map((g) => {
      const perf = perfByGroup.get(g.id);
      const scores = perf?.scores ?? [];
      return {
        groupId: g.id,
        name: g.name,
        overallAverage: scores.length ? round2(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
        overallPassRate: percentage(perf?.passingCount ?? 0, scores.length),
        assessedCount: scores.length,
      };
    });

    return {
      groupCount,
      studentCount,
      averageUtilization,
      capacityUtilization,
      teacherWorkload: [...teacherWorkloadMap.values()],
      groupPerformance,
      groups: { items: groups.map((g) => ({ id: g.id, name: g.name, code: g.code, course: g.course, branch: g.branch, teacher: g.teacherEmployee, status: g.status, enrolledCount: g._count.enrollments })), total: groupsTotal, page, pageSize },
    };
  }

  // ---------------------------------------------------------------------------
  // ATTENDANCE
  // ---------------------------------------------------------------------------

  async getAttendanceReport(query: EducationReportQueryDto) {
    // No date range given at all -> default to the last 90 days rather than
    // scanning the attendance table's entire history, per "avoid loading
    // massive datasets unnecessarily". An explicit from/to always wins.
    const hasExplicitRange = !!(query.from || query.to);
    const scheduledStart = hasExplicitRange ? dateRange(query.from, query.to) : { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) };

    const attendanceWhere: Prisma.StudentAttendanceWhereInput = {
      studentId: query.studentId,
      lesson: {
        groupId: query.groupId,
        teacherEmployeeId: query.teacherEmployeeId,
        branchId: query.branchId,
        group: query.courseId ? { courseId: query.courseId } : undefined,
        scheduledStart,
      },
    };

    // ONE bounded fetch (a handful of small fields, not full rows) backs
    // every breakdown below — overall, by-student, by-group and by-teacher
    // all reflect the exact same filtered slice, so the numbers can never
    // disagree with each other the way separately-filtered queries could.
    const records = await this.prisma.studentAttendance.findMany({
      where: attendanceWhere,
      select: { studentId: true, status: true, lesson: { select: { groupId: true, teacherEmployeeId: true } } },
    });

    const overallTally = this.tally(records);
    const overall = {
      totalMarked: overallTally.total,
      present: overallTally.present,
      absent: overallTally.absent,
      late: overallTally.late,
      excused: overallTally.excused,
      attendancePercentage: overallTally.attendancePercentage,
      absenceRate: percentage(overallTally.absent, overallTally.total),
      lateRate: percentage(overallTally.late, overallTally.total),
      excusedRate: percentage(overallTally.excused, overallTally.total),
    };

    const byStudentMap = new Map<string, typeof records>();
    const byGroupMap = new Map<string, typeof records>();
    const byTeacherMap = new Map<string, typeof records>();
    for (const r of records) {
      (byStudentMap.get(r.studentId) ?? byStudentMap.set(r.studentId, []).get(r.studentId)!).push(r);
      if (r.lesson.groupId) (byGroupMap.get(r.lesson.groupId) ?? byGroupMap.set(r.lesson.groupId, []).get(r.lesson.groupId)!).push(r);
      if (r.lesson.teacherEmployeeId) (byTeacherMap.get(r.lesson.teacherEmployeeId) ?? byTeacherMap.set(r.lesson.teacherEmployeeId, []).get(r.lesson.teacherEmployeeId)!).push(r);
    }

    const studentIds = [...byStudentMap.keys()];
    const groupIds = [...byGroupMap.keys()];
    const teacherIds = [...byTeacherMap.keys()];
    const [students, groupsMeta, teachersMeta] = await Promise.all([
      studentIds.length ? this.prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, studentCode: true, fullName: true } }) : [],
      groupIds.length ? this.prisma.studentGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true, code: true } }) : [],
      teacherIds.length ? this.prisma.employee.findMany({ where: { id: { in: teacherIds } }, select: { id: true, fullName: true } }) : [],
    ]);
    const studentById = new Map(students.map((s) => [s.id, s]));
    const groupById = new Map(groupsMeta.map((g) => [g.id, g]));
    const teacherById = new Map(teachersMeta.map((t) => [t.id, t]));

    return {
      overall,
      byStudent: [...byStudentMap.entries()].map(([id, rows]) => ({ student: studentById.get(id) ?? { id }, ...this.tally(rows) })),
      byGroup: [...byGroupMap.entries()].map(([id, rows]) => ({ group: groupById.get(id) ?? { id }, ...this.tally(rows) })),
      byTeacher: [...byTeacherMap.entries()].map(([id, rows]) => ({ teacher: teacherById.get(id) ?? { id }, ...this.tally(rows) })),
    };
  }

  private tally(records: Array<{ status: string }>) {
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    for (const r of records) {
      if (r.status === 'PRESENT') present += 1;
      else if (r.status === 'ABSENT') absent += 1;
      else if (r.status === 'LATE') late += 1;
      else if (r.status === 'EXCUSED') excused += 1;
    }
    const total = present + absent + late + excused;
    return { present, absent, late, excused, total, attendancePercentage: percentage(present + late, total) };
  }

  // ---------------------------------------------------------------------------
  // ACADEMIC
  // ---------------------------------------------------------------------------

  async getAcademicReport(query: EducationReportQueryDto, actorUserId: string) {
    if (query.studentId) {
      // Single-student view delegates entirely to AcademicProgressService
      // (Phase H) — never recomputed a second way. Unlike getGroupResults,
      // getStudentGrades/getStudentProgress only ever silently NARROW by the
      // caller's own teacher scope (never reject), so passing the real
      // actorUserId through is safe here and gives the exact "Teachers see
      // only permitted academic reports" behavior for free.
      const progress = await this.academicProgress.getStudentProgress(query.studentId, actorUserId);
      return { scope: 'student' as const, studentProgress: progress };
    }

    const examDate = dateRange(query.from, query.to);
    const examWhere: Prisma.ExamWhereInput = {
      groupId: query.groupId,
      teacherEmployeeId: query.teacherEmployeeId,
      courseId: query.courseId,
      group: query.branchId ? { branchId: query.branchId } : undefined,
      date: examDate,
    };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [exams, examsTotal] = await Promise.all([
      this.prisma.exam.findMany({
        where: examWhere,
        include: {
          course: { select: { id: true, name: true } },
          group: { select: { id: true, name: true } },
          assessments: { select: { score: true, percentage: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.exam.count({ where: examWhere }),
    ]);

    const examResults = exams.map((exam) => {
      const passingScore = Number(exam.passingScore);
      const scores = exam.assessments.map((a) => Number(a.score));
      const percentages = exam.assessments.map((a) => Number(a.percentage));
      const passCount = scores.filter((s) => s >= passingScore).length;
      return {
        examId: exam.id,
        title: exam.title,
        course: exam.course,
        group: exam.group,
        date: exam.date,
        assessedCount: exam.assessments.length,
        average: percentages.length ? round2(percentages.reduce((s, p) => s + p, 0) / percentages.length) : 0,
        passRate: percentage(passCount, exam.assessments.length),
      };
    });

    const allAssessments = await this.prisma.assessment.findMany({
      where: { exam: examWhere },
      select: { score: true, percentage: true, exam: { select: { passingScore: true, courseId: true, course: { select: { name: true } }, groupId: true, group: { select: { name: true } } } } },
    });
    const averageScore = allAssessments.length ? round2(allAssessments.reduce((s, a) => s + Number(a.percentage), 0) / allAssessments.length) : 0;
    const overallPassCount = allAssessments.filter((a) => Number(a.score) >= Number(a.exam.passingScore)).length;
    const passRate = percentage(overallPassCount, allAssessments.length);

    const coursePerfMap = new Map<string, { name: string; scores: number[] }>();
    const groupPerfMap = new Map<string, { name: string; scores: number[] }>();
    for (const a of allAssessments) {
      const cp = coursePerfMap.get(a.exam.courseId) ?? { name: a.exam.course.name, scores: [] };
      cp.scores.push(Number(a.percentage));
      coursePerfMap.set(a.exam.courseId, cp);
      const gp = groupPerfMap.get(a.exam.groupId) ?? { name: a.exam.group.name, scores: [] };
      gp.scores.push(Number(a.percentage));
      groupPerfMap.set(a.exam.groupId, gp);
    }
    const avg = (scores: number[]) => (scores.length ? round2(scores.reduce((s, v) => s + v, 0) / scores.length) : 0);
    const coursePerformance = [...coursePerfMap.entries()].map(([courseId, v]) => ({ courseId, courseName: v.name, average: avg(v.scores), assessedCount: v.scores.length }));
    const groupPerformance = [...groupPerfMap.entries()].map(([groupId, v]) => ({ groupId, groupName: v.name, average: avg(v.scores), assessedCount: v.scores.length }));

    return {
      scope: 'overview' as const,
      averageScore,
      passRate,
      examResults: { items: examResults, total: examsTotal, page, pageSize },
      coursePerformance,
      groupPerformance,
    };
  }

  // ---------------------------------------------------------------------------
  // FINANCIAL EDUCATION — reuses ReportsService's existing tuition methods verbatim (Phase G), adding only payment-method breakdown.
  // ---------------------------------------------------------------------------

  async getTuitionReport(query: EducationReportQueryDto) {
    const tuitionQuery = { billingPeriodFrom: query.from?.slice(0, 7), billingPeriodTo: query.to?.slice(0, 7), from: query.from, to: query.to };
    const [billed, collected, outstanding, overdue, collectionRate] = await Promise.all([
      this.reportsService.tuitionBilled(tuitionQuery),
      this.reportsService.tuitionCollected(tuitionQuery),
      this.reportsService.tuitionOutstanding(tuitionQuery),
      this.reportsService.tuitionOverdue(tuitionQuery),
      this.reportsService.tuitionCollectionRate(tuitionQuery),
    ]);

    const paymentWhere: Prisma.PaymentWhereInput = {
      referenceType: 'TUITION_CHARGE',
      status: 'COMPLETED',
      createdAt: dateRange(query.from, query.to),
    };
    const byMethodRaw = await this.prisma.payment.groupBy({ by: ['method'], where: paymentWhere, _sum: { amount: true }, _count: { _all: true } });
    const paymentMethodBreakdown = Object.fromEntries(Object.values(PaymentMethod).map((m) => [m, { count: 0, amount: 0 }])) as Record<PaymentMethod, { count: number; amount: number }>;
    for (const row of byMethodRaw) paymentMethodBreakdown[row.method] = { count: row._count._all, amount: round2(toNumber(row._sum.amount)) };

    return { billed, collected, outstanding, overdue, collectionRate, paymentMethodBreakdown };
  }

  // ---------------------------------------------------------------------------
  // TEACHERS
  // ---------------------------------------------------------------------------

  async getTeachersReport(query: EducationReportQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const profileWhere: Prisma.TeacherProfileWhereInput = {
      employeeId: query.teacherEmployeeId,
      employee: query.branchId ? { taughtGroups: { some: { branchId: query.branchId } } } : undefined,
    };

    const [profiles, total] = await Promise.all([
      this.prisma.teacherProfile.findMany({
        where: profileWhere,
        include: { employee: { select: { id: true, fullName: true, employeeCode: true } } },
        orderBy: { employee: { fullName: 'asc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.teacherProfile.count({ where: profileWhere }),
    ]);

    const lessonDate = dateRange(query.from, query.to);
    const items = await Promise.all(
      profiles.map(async (profile) => {
        const employeeId = profile.employeeId;
        const [groupsCount, studentsCount, lessons, attendanceAgg] = await Promise.all([
          this.prisma.studentGroup.count({ where: { teacherEmployeeId: employeeId, status: 'ACTIVE' } }),
          this.prisma.enrollment.count({ where: { status: { not: 'CANCELLED' }, group: { teacherEmployeeId: employeeId } } }),
          this.prisma.lesson.findMany({ where: { teacherEmployeeId: employeeId, status: 'COMPLETED', scheduledStart: lessonDate }, select: { scheduledStart: true, scheduledEnd: true } }),
          this.prisma.studentAttendance.groupBy({ by: ['status'], where: { lesson: { teacherEmployeeId: employeeId, scheduledStart: lessonDate } }, _count: { _all: true } }),
        ]);

        const lessonCount = lessons.length;
        const hours = round2(lessons.reduce((sum, l) => sum + (l.scheduledEnd.getTime() - l.scheduledStart.getTime()) / 3_600_000, 0));
        const attendanceCounts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
        for (const row of attendanceAgg) attendanceCounts[row.status] = row._count._all;
        const attendanceTotal = attendanceCounts.PRESENT + attendanceCounts.ABSENT + attendanceCounts.LATE + attendanceCounts.EXCUSED;
        const attendancePercentage = percentage(attendanceCounts.PRESENT + attendanceCounts.LATE, attendanceTotal);

        return {
          teacherEmployeeId: employeeId,
          teacherProfileId: profile.id,
          name: profile.employee.fullName,
          employeeCode: profile.employee.employeeCode,
          groups: groupsCount,
          students: studentsCount,
          lessonCount,
          hours,
          attendance: { total: attendanceTotal, percentage: attendancePercentage },
          workload: { groups: groupsCount, students: studentsCount, lessonCount, hours },
        };
      }),
    );

    return { items, total, page, pageSize };
  }

  // ---------------------------------------------------------------------------
  // BRANCH
  // ---------------------------------------------------------------------------

  async getBranchesReport(query: EducationReportQueryDto) {
    const branchWhere: Prisma.BranchWhereInput = { id: query.branchId };
    const branches = await this.prisma.branch.findMany({ where: branchWhere, orderBy: { name: 'asc' } });

    const items = await Promise.all(
      branches.map(async (branch) => {
        const [studentsCount, groups, tuitionCharges] = await Promise.all([
          this.prisma.student.count({ where: { branchId: branch.id, registrationDate: dateRange(query.from, query.to) } }),
          this.prisma.studentGroup.findMany({ where: { branchId: branch.id }, select: { id: true, teacherEmployeeId: true } }),
          this.prisma.tuitionCharge.findMany({
            where: { status: { not: 'CANCELLED' }, enrollment: { group: { branchId: branch.id } }, createdAt: dateRange(query.from, query.to) },
            select: { netAmount: true, allocations: { select: { amount: true } } },
          }),
        ]);

        const teacherIds = new Set(groups.map((g) => g.teacherEmployeeId).filter((id): id is string => id !== null));
        const billed = tuitionCharges.reduce((sum, c) => sum + Number(c.netAmount), 0);
        const collected = tuitionCharges.reduce((sum, c) => sum + c.allocations.reduce((s, a) => s + Number(a.amount), 0), 0);

        const groupIds = groups.map((g) => g.id);
        const attendanceAgg = groupIds.length
          ? await this.prisma.studentAttendance.groupBy({ by: ['status'], where: { lesson: { groupId: { in: groupIds } } }, _count: { _all: true } })
          : [];
        const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
        for (const row of attendanceAgg) counts[row.status] = row._count._all;
        const totalMarked = counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED;

        return {
          branchId: branch.id,
          branchName: branch.name,
          students: studentsCount,
          groups: groups.length,
          teachers: teacherIds.size,
          tuition: { billed: round2(billed), collected: round2(collected) },
          attendance: { totalMarked, percentage: percentage(counts.PRESENT + counts.LATE, totalMarked) },
        };
      }),
    );

    return { items };
  }

  // ---------------------------------------------------------------------------
  // DASHBOARD DATA — reusable by a future Phase J dashboard controller.
  // Deliberately just a thin composition of the methods above (no separate
  // computation path, so it can never drift from the report figures).
  // ---------------------------------------------------------------------------

  async getDashboardData() {
    const empty: EducationReportQueryDto = {};
    const [students, groups, attendance, academic, tuition] = await Promise.all([
      this.getStudentsReport(empty),
      this.getGroupsReport(empty),
      this.getAttendanceReport(empty),
      this.getAcademicReport(empty, ''), // no studentId in `empty`, so the actorUserId-dependent branch is never taken here
      this.getTuitionReport(empty),
    ]);

    return {
      totalStudents: students.totalStudents,
      activeStudents: students.activeStudents,
      groupCount: groups.groupCount,
      averageUtilization: groups.averageUtilization,
      attendancePercentage: attendance.overall.attendancePercentage,
      averageScore: academic.scope === 'overview' ? academic.averageScore : null,
      passRate: academic.scope === 'overview' ? academic.passRate : null,
      tuitionBilled: tuition.billed.totalBilled,
      tuitionCollected: tuition.collected.totalCollected,
      tuitionOutstanding: tuition.outstanding.totalOutstanding,
    };
  }
}
