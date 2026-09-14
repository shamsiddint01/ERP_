import { Injectable } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { permissionKey, type PermissionModule } from '../../shared/constants/permission-modules.constant.js';
import { RolePermissionsCacheService } from '../../shared/rbac/role-permissions-cache.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ReportsService } from '../reports/reports.service.js';

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

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function endOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
}

function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** present+late counts as "attended" — mirrors EducationReportsService.tally (Phase I) exactly, so the meaning of "attendance %" never diverges across the app. */
function tally(records: Array<{ status: string }>) {
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

/**
 * Professional education-center executive dashboard (Phase J) — replaces
 * the previous generic-ERP overview entirely (nothing else in the frontend
 * consumed the old shape; confirmed via grep before this rewrite).
 *
 * RBAC model: this service is reachable by any authenticated user (the
 * controller applies no @RequirePermission — PermissionsGuard only supports
 * one check per route, so a single blanket gate can't express "different
 * KPIs for different roles"). Instead, EVERY section below is included only
 * when the caller's own granted permissions cover it — exactly the pattern
 * EducationReportsController established in Phase I for the compensation
 * slice of the teachers report, just applied across a whole KPI set. A
 * teacher additionally gets several sections *narrowed* to their own
 * groups/lessons via resolveTeacherScope (Phase H/F's existing mechanism,
 * reused verbatim) rather than a hardcoded role-name branch.
 *
 * Performance: one HTTP round trip per section (overview / charts / today),
 * each backed by a small set of targeted, parallel, lightweight Prisma
 * queries — never the heavier EducationReportsService report methods (those
 * compute far more than a KPI strip needs). No new caching layer: every
 * figure here is either a live financial/operational number (which must
 * never be stale) or already cheap enough that caching would add risk
 * without a measurable benefit.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
    private readonly notificationsService: NotificationsService,
    private readonly permissionsCache: RolePermissionsCacheService,
  ) {}

  private async hasPermission(roleId: string, module: PermissionModule): Promise<boolean> {
    const granted = await this.permissionsCache.getPermissionsForRole(roleId);
    return granted.includes(permissionKey(module, PermissionAction.VIEW));
  }

  /** Mirrors exams/teacher-scope.util.ts's resolveTeacherScope exactly (duplicated per this codebase's established per-module convention — see student-attendance.service.ts for the same duplication). */
  private async resolveTeacherScope(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) return null;
    const profile = await this.prisma.teacherProfile.findUnique({ where: { employeeId: user.employeeId }, select: { status: true } });
    if (!profile || profile.status !== 'ACTIVE') return null;
    return user.employeeId;
  }

  private async context(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { roleId: true } });
    const [granted, teacherScope] = await Promise.all([
      this.permissionsCache.getPermissionsForRole(user.roleId),
      this.resolveTeacherScope(userId),
    ]);
    const has = (module: PermissionModule) => granted.includes(permissionKey(module, PermissionAction.VIEW));
    return { has, teacherScope };
  }

  // ---------------------------------------------------------------------------
  // KPIs + ACTION REQUIRED
  // ---------------------------------------------------------------------------

  async getOverview(userId: string) {
    const { has, teacherScope } = await this.context(userId);
    const startOfToday = startOfTodayUtc();
    const endOfToday = endOfTodayUtc();
    const startOfMonth = startOfMonthUtc();

    const kpis: Record<string, number> = {};
    const jobs: Promise<void>[] = [];

    if (has('students')) {
      jobs.push(
        Promise.all([
          this.prisma.student.count(),
          this.prisma.student.count({ where: { status: 'ACTIVE' } }),
          this.prisma.student.count({ where: { registrationDate: { gte: startOfMonth } } }),
        ]).then(([total, active, newThisMonth]) => {
          kpis.totalStudents = total;
          kpis.activeStudents = active;
          kpis.newStudentsThisMonth = newThisMonth;
        }),
      );
    }

    if (has('groups')) {
      jobs.push(
        this.prisma.studentGroup
          .count({ where: { status: 'ACTIVE', teacherEmployeeId: teacherScope ?? undefined } })
          .then((count) => {
            kpis.activeGroups = count;
          }),
      );
    }

    if (has('teachers')) {
      jobs.push(this.prisma.teacherProfile.count().then((count) => { kpis.totalTeachers = count; }));
    }

    if (has('lessons')) {
      jobs.push(
        this.prisma.lesson
          .count({ where: { scheduledStart: { gte: startOfToday, lte: endOfToday }, teacherEmployeeId: teacherScope ?? undefined } })
          .then((count) => { kpis.todaysLessons = count; }),
      );
    }

    if (has('student_attendance')) {
      jobs.push(
        this.prisma.studentAttendance
          .findMany({
            where: { lesson: { scheduledStart: { gte: startOfToday, lte: endOfToday }, teacherEmployeeId: teacherScope ?? undefined } },
            select: { status: true },
          })
          .then((records) => {
            const t = tally(records);
            kpis.todaysAttendancePercentage = t.attendancePercentage;
            kpis.absentStudentsToday = t.absent;
          }),
      );
    }

    if (has('tuition')) {
      jobs.push(
        Promise.all([
          this.reportsService.tuitionOutstanding({}),
          this.reportsService.tuitionOverdue({}),
          this.prisma.payment.aggregate({
            where: { referenceType: 'TUITION_CHARGE', status: 'COMPLETED', createdAt: { gte: startOfMonth } },
            _sum: { amount: true },
          }),
        ]).then(([outstanding, overdue, collected]) => {
          kpis.outstandingStudentDebt = outstanding.totalOutstanding;
          kpis.overdueTuition = overdue.totalOverdue;
          kpis.tuitionCollectedThisMonth = round2(toNumber(collected._sum.amount));
        }),
      );
    }

    if (has('finance')) {
      jobs.push(
        this.reportsService.profitAndLoss({ from: isoDate(startOfMonth), to: isoDate(new Date()) }).then((pnl) => {
          kpis.monthlyExpenses = pnl.totalExpense;
          kpis.monthlyProfit = pnl.netIncome;
        }),
      );
    }

    if (has('payroll')) {
      jobs.push(
        this.prisma.payroll.aggregate({ where: { status: 'APPROVED' }, _sum: { netSalary: true } }).then((agg) => {
          kpis.payrollPayable = round2(toNumber(agg._sum.netSalary));
        }),
      );
    }

    if (has('leads')) {
      jobs.push(
        Promise.all([
          this.prisma.lead.count({ where: { createdAt: { gte: startOfMonth } } }),
          this.prisma.lead.count({ where: { status: 'ENROLLED' } }),
          this.prisma.lead.count(),
        ]).then(([newLeads, enrolled, total]) => {
          kpis.newLeads = newLeads;
          kpis.leadConversionRate = percentage(enrolled, total);
        }),
      );
    }

    if (has('exams')) {
      jobs.push(
        this.prisma.exam
          .count({ where: { status: 'SCHEDULED', date: { gte: new Date() }, teacherEmployeeId: teacherScope ?? undefined } })
          .then((count) => { kpis.upcomingExams = count; }),
      );
    }

    // Personal to the caller — never permission-gated, matching the existing Notifications system's own design.
    const pendingExpenses = has('expenses')
      ? this.prisma.expense.count({ where: { status: 'PENDING' } })
      : Promise.resolve(null);
    const pendingPayroll = has('payroll') ? this.prisma.payroll.count({ where: { status: 'CALCULATED' } }) : Promise.resolve(null);

    const [unread, pendingExpensesCount, pendingPayrollCount] = await Promise.all([
      this.notificationsService.unreadCount(userId),
      pendingExpenses,
      pendingPayroll,
      ...jobs,
    ]);
    kpis.unreadNotifications = unread.count;

    // `key` is a stable identifier only — no label here. Every other
    // enum/key value in this app (LeadStatus, ExamType, ...) is localized on
    // the frontend, never the backend; action-required cards follow the
    // same split so the UI's language never depends on what the API sends.
    const actionRequired = [
      kpis.overdueTuition > 0 && { key: 'overdueTuition', value: kpis.overdueTuition, to: '/tuition?status=OVERDUE' },
      pendingPayrollCount !== null && pendingPayrollCount > 0 && { key: 'pendingPayroll', value: pendingPayrollCount, to: '/payroll' },
      pendingExpensesCount !== null && pendingExpensesCount > 0 && { key: 'pendingExpenses', value: pendingExpensesCount, to: '/expenses' },
      kpis.absentStudentsToday > 0 && { key: 'absentStudentsToday', value: kpis.absentStudentsToday, to: '/attendance/student' },
      kpis.upcomingExams > 0 && { key: 'upcomingExams', value: kpis.upcomingExams, to: '/exams' },
      kpis.newLeads > 0 && { key: 'newLeads', value: kpis.newLeads, to: '/leads' },
      kpis.unreadNotifications > 0 && { key: 'unreadNotifications', value: kpis.unreadNotifications, to: '/notifications' },
    ].filter((card): card is { key: string; value: number; to: string } => Boolean(card));

    return { kpis, actionRequired };
  }

  // ---------------------------------------------------------------------------
  // TODAY — schedule table + attendance status
  // ---------------------------------------------------------------------------

  async getToday(userId: string) {
    const { has, teacherScope } = await this.context(userId);
    const startOfToday = startOfTodayUtc();
    const endOfToday = endOfTodayUtc();

    const schedule = has('lessons')
      ? await this.prisma.lesson.findMany({
          where: { scheduledStart: { gte: startOfToday, lte: endOfToday }, teacherEmployeeId: teacherScope ?? undefined },
          select: {
            id: true,
            scheduledStart: true,
            scheduledEnd: true,
            status: true,
            group: { select: { id: true, name: true } },
            teacherEmployee: { select: { id: true, fullName: true } },
            classroom: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
          },
          orderBy: { scheduledStart: 'asc' },
        })
      : [];

    const attendance = has('student_attendance')
      ? tally(
          await this.prisma.studentAttendance.findMany({
            where: { lesson: { scheduledStart: { gte: startOfToday, lte: endOfToday }, teacherEmployeeId: teacherScope ?? undefined } },
            select: { status: true },
          }),
        )
      : null;

    return { schedule, attendance };
  }

  // ---------------------------------------------------------------------------
  // CHARTS
  // ---------------------------------------------------------------------------

  async getCharts(userId: string) {
    const { has, teacherScope } = await this.context(userId);
    const months = 6;
    const monthsAgo = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (months - 1), 1));
    const days = 14;
    const daysAgo = new Date(startOfTodayUtc().getTime() - (days - 1) * 86_400_000);

    const charts: Record<string, unknown> = {};

    if (has('students')) {
      const newStudents = await this.prisma.student.findMany({ where: { registrationDate: { gte: monthsAgo } }, select: { registrationDate: true } });
      charts.studentGrowth = this.bucketByMonth(monthsAgo, months, newStudents.map((s) => s.registrationDate));
      const byBranch = await this.prisma.student.groupBy({ by: ['branchId'], _count: { _all: true } });
      const branches = await this.prisma.branch.findMany({ where: { id: { in: byBranch.map((b) => b.branchId).filter((id): id is string => !!id) } }, select: { id: true, name: true } });
      const branchById = new Map(branches.map((b) => [b.id, b.name]));
      charts.studentsByBranch = byBranch.map((b) => ({ branchId: b.branchId, branchName: b.branchId ? (branchById.get(b.branchId) ?? 'Unknown') : 'Unassigned', count: b._count._all }));
    }

    if (has('groups')) {
      const newEnrollments = await this.prisma.enrollment.findMany({ where: { startDate: { gte: monthsAgo } }, select: { startDate: true } });
      charts.enrollmentTrend = this.bucketByMonth(monthsAgo, months, newEnrollments.map((e) => e.startDate));

      const activeGroups = await this.prisma.studentGroup.findMany({
        where: { status: 'ACTIVE', teacherEmployeeId: teacherScope ?? undefined },
        select: { id: true, name: true, capacity: true, _count: { select: { enrollments: { where: { status: { not: 'CANCELLED' } } } } } },
      });
      charts.groupCapacityUtilization = activeGroups.map((g) => ({ groupId: g.id, name: g.name, capacity: g.capacity, enrolledCount: g._count.enrollments, utilizationPercentage: percentage(g._count.enrollments, g.capacity) }));
    }

    if (has('students') && has('groups')) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { status: { not: 'CANCELLED' } },
        select: { studentId: true, group: { select: { courseId: true, course: { select: { name: true } } } } },
      });
      const byCourse = new Map<string, { name: string; students: Set<string> }>();
      for (const e of enrollments) {
        const entry = byCourse.get(e.group.courseId) ?? { name: e.group.course.name, students: new Set<string>() };
        entry.students.add(e.studentId);
        byCourse.set(e.group.courseId, entry);
      }
      charts.studentsByCourse = [...byCourse.entries()].map(([courseId, v]) => ({ courseId, courseName: v.name, studentCount: v.students.size }));
    }

    if (has('tuition')) {
      const payments = await this.prisma.payment.findMany({
        where: { referenceType: 'TUITION_CHARGE', status: 'COMPLETED', createdAt: { gte: monthsAgo } },
        select: { createdAt: true, amount: true },
      });
      const byMonth = new Map<string, number>();
      for (let i = 0; i < months; i++) byMonth.set(monthKey(new Date(Date.UTC(monthsAgo.getUTCFullYear(), monthsAgo.getUTCMonth() + i, 1))), 0);
      for (const p of payments) byMonth.set(monthKey(p.createdAt), (byMonth.get(monthKey(p.createdAt)) ?? 0) + toNumber(p.amount));
      charts.tuitionCollection = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount: round2(amount) }));
    }

    if (has('finance')) {
      const revenueExpenseAccounts = await this.prisma.account.findMany({ where: { category: { in: ['REVENUE', 'EXPENSE'] }, isPostable: true }, select: { id: true, category: true } });
      const lines = await this.prisma.journalLine.findMany({
        where: { accountId: { in: revenueExpenseAccounts.map((a) => a.id) }, journalEntry: { entryDate: { gte: monthsAgo } } },
        select: { accountId: true, debit: true, credit: true, journalEntry: { select: { entryDate: true } } },
      });
      const categoryByAccount = new Map(revenueExpenseAccounts.map((a) => [a.id, a.category]));
      const byMonth = new Map<string, { income: number; expenses: number }>();
      for (let i = 0; i < months; i++) byMonth.set(monthKey(new Date(Date.UTC(monthsAgo.getUTCFullYear(), monthsAgo.getUTCMonth() + i, 1))), { income: 0, expenses: 0 });
      for (const line of lines) {
        const key = monthKey(line.journalEntry.entryDate);
        const bucket = byMonth.get(key);
        if (!bucket) continue;
        const category = categoryByAccount.get(line.accountId);
        if (category === 'REVENUE') bucket.income += toNumber(line.credit) - toNumber(line.debit);
        else if (category === 'EXPENSE') bucket.expenses += toNumber(line.debit) - toNumber(line.credit);
      }
      charts.incomeVsExpenses = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, income: round2(v.income), expenses: round2(v.expenses) }));
    }

    if (has('student_attendance')) {
      const records = await this.prisma.studentAttendance.findMany({
        where: { lesson: { scheduledStart: { gte: daysAgo }, teacherEmployeeId: teacherScope ?? undefined } },
        select: { status: true, lesson: { select: { scheduledStart: true } } },
      });
      const byDay = new Map<string, { status: string }[]>();
      for (let i = 0; i < days; i++) byDay.set(isoDate(new Date(daysAgo.getTime() + i * 86_400_000)), []);
      for (const r of records) {
        const key = isoDate(r.lesson.scheduledStart);
        (byDay.get(key) ?? byDay.set(key, []).get(key)!).push({ status: r.status });
      }
      charts.attendanceTrend = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({ date, attendancePercentage: tally(rows).attendancePercentage }));
    }

    if (has('leads')) {
      const bySource = await this.prisma.lead.groupBy({ by: ['status'], _count: { _all: true } });
      charts.leadConversionFunnel = bySource.map((r) => ({ status: r.status, count: r._count._all }));
    }

    if (has('grades') || has('exams')) {
      const assessments = await this.prisma.assessment.findMany({
        where: { evaluatedAt: { gte: monthsAgo }, exam: { teacherEmployeeId: teacherScope ?? undefined } },
        select: { percentage: true, evaluatedAt: true },
      });
      const byMonth = new Map<string, number[]>();
      for (let i = 0; i < months; i++) byMonth.set(monthKey(new Date(Date.UTC(monthsAgo.getUTCFullYear(), monthsAgo.getUTCMonth() + i, 1))), []);
      for (const a of assessments) {
        const key = monthKey(a.evaluatedAt);
        (byMonth.get(key) ?? byMonth.set(key, []).get(key)!).push(toNumber(a.percentage));
      }
      charts.academicPerformance = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, scores]) => ({ month, averageScore: scores.length ? round2(scores.reduce((s, v) => s + v, 0) / scores.length) : 0 }));
    }

    return charts;
  }

  /** Buckets a list of dates into `months` consecutive calendar-month counts starting at `since`, zero-filling months with no events. */
  private bucketByMonth(since: Date, months: number, dates: Date[]) {
    const byMonth = new Map<string, number>();
    for (let i = 0; i < months; i++) byMonth.set(monthKey(new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + i, 1))), 0);
    for (const date of dates) byMonth.set(monthKey(date), (byMonth.get(monthKey(date)) ?? 0) + 1);
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
  }
}
