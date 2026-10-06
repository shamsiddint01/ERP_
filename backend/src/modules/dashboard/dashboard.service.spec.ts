import { describe, expect, it, vi } from 'vitest';
import { DashboardService } from './dashboard.service.js';

const ALL_MODULES = ['students', 'groups', 'teachers', 'lessons', 'student_attendance', 'tuition', 'payments', 'exams'];

function permissionsFor(modules: string[]) {
  return modules.flatMap((m) => [`${m}:VIEW`]);
}

function createPrismaMock(opts: {
  employeeId?: string | null;
  teacherProfileStatus?: string | null;
  students?: { total?: number; active?: number; newThisMonth?: number; byBranch?: { branchId: string | null; _count: { _all: number } }[]; growthDates?: Date[] };
  groups?: { activeCount?: number; activeGroups?: { id: string; name: string; capacity: number; _count: { enrollments: number } }[] };
  teachersCount?: number;
  lessonsToday?: number;
  scheduleRows?: unknown[];
  attendanceRecords?: { status: string }[];
  upcomingExamsCount?: number;
  paymentSumThisMonth?: number | null;
  branches?: { id: string; name: string }[];
  enrollmentsForCourse?: { studentId: string; group: { courseId: string; course: { name: string } } }[];
  paymentsForChart?: { createdAt: Date; amount: string }[];
  recentPayments?: { id: string; paymentNumber: string; amount: string; method: string; status: string; paidAt: Date | null; createdAt: Date; referenceId: string | null }[];
  studentsByIdForPayments?: { id: string; fullName: string }[];
  assessments?: { percentage: string; evaluatedAt: Date }[];
  enrollmentGrowth?: Date[];
} = {}) {
  const employeeId = 'employeeId' in opts ? opts.employeeId : null;
  return {
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ roleId: 'role1' }), findUnique: vi.fn().mockResolvedValue({ employeeId }) },
    teacherProfile: {
      findUnique: vi.fn().mockResolvedValue(employeeId ? { status: opts.teacherProfileStatus ?? 'ACTIVE' } : null),
      count: vi.fn().mockResolvedValue(opts.teachersCount ?? 0),
    },
    student: {
      count: vi
        .fn()
        .mockResolvedValueOnce(opts.students?.total ?? 0)
        .mockResolvedValueOnce(opts.students?.active ?? 0)
        .mockResolvedValueOnce(opts.students?.newThisMonth ?? 0),
      groupBy: vi.fn().mockResolvedValue(opts.students?.byBranch ?? []),
      findMany: vi.fn().mockResolvedValue((opts.students?.growthDates ?? []).map((registrationDate) => ({ registrationDate }))),
    },
    studentGroup: {
      count: vi.fn().mockResolvedValue(opts.groups?.activeCount ?? 0),
      findMany: vi.fn().mockResolvedValue(opts.groups?.activeGroups ?? []),
    },
    lesson: {
      count: vi.fn().mockResolvedValue(opts.lessonsToday ?? 0),
      findMany: vi.fn().mockResolvedValue(opts.scheduleRows ?? []),
    },
    studentAttendance: { findMany: vi.fn().mockResolvedValue(opts.attendanceRecords ?? []) },
    exam: { count: vi.fn().mockResolvedValue(opts.upcomingExamsCount ?? 0) },
    payment: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: opts.paymentSumThisMonth ?? null } }),
      findMany: vi.fn().mockImplementation((args: { take?: number }) => Promise.resolve(args.take ? (opts.recentPayments ?? []) : (opts.paymentsForChart ?? []))),
    },
    branch: { findMany: vi.fn().mockResolvedValue(opts.branches ?? []) },
    enrollment: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce((opts.enrollmentGrowth ?? []).map((startDate) => ({ startDate })))
        .mockResolvedValueOnce(opts.enrollmentsForCourse ?? []),
    },
    assessment: { findMany: vi.fn().mockResolvedValue(opts.assessments ?? []) },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>, grantedModules: string[], serviceOverrides: { reportsService?: Record<string, unknown>; notificationsService?: Record<string, unknown> } = {}) {
  const permissionsCache = { getPermissionsForRole: vi.fn().mockResolvedValue(permissionsFor(grantedModules)) };
  const reportsService = {
    tuitionOutstanding: vi.fn().mockResolvedValue({ rows: [], totalOutstanding: 0 }),
    tuitionOverdue: vi.fn().mockResolvedValue({ rows: [], totalOverdue: 0 }),
    ...serviceOverrides.reportsService,
  };
  const notificationsService = { unreadCount: vi.fn().mockResolvedValue({ count: 0 }), ...serviceOverrides.notificationsService };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new DashboardService(prisma as any, reportsService as any, notificationsService as any, permissionsCache as any);
  return { service, prisma, reportsService, notificationsService, permissionsCache };
}

describe('DashboardService.getOverview', () => {
  it('includes only KPIs the caller has permission for — a zero-permission user gets just unreadNotifications', async () => {
    const prisma = createPrismaMock({});
    const { service } = createService(prisma, []);

    const result = await service.getOverview('user1');

    expect(Object.keys(result.kpis)).toEqual(['unreadNotifications']);
    expect(result.actionRequired).toEqual([]);
  });

  it('computes Total/Active/New students only, gated by students:VIEW', async () => {
    const prisma = createPrismaMock({ students: { total: 10, active: 8, newThisMonth: 2 } });
    const { service } = createService(prisma, ['students']);

    const result = await service.getOverview('user1');

    expect(result.kpis).toMatchObject({ totalStudents: 10, activeStudents: 8, newStudentsThisMonth: 2 });
    expect(result.kpis).not.toHaveProperty('activeGroups');
  });

  it('narrows Active Groups to the caller\'s own teacherEmployeeId when they resolve to an active teacher', async () => {
    const prisma = createPrismaMock({ employeeId: 'emp1', teacherProfileStatus: 'ACTIVE', groups: { activeCount: 2 } });
    const { service } = createService(prisma, ['groups']);

    await service.getOverview('teacher-user-1');

    expect(prisma.studentGroup.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE', teacherEmployeeId: 'emp1' } });
  });

  it('does NOT narrow for a non-teacher (no employeeId, or an inactive teacher profile)', async () => {
    const prisma = createPrismaMock({ employeeId: null });
    const { service } = createService(prisma, ['groups']);

    await service.getOverview('manager-user-1');

    expect(prisma.studentGroup.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE', teacherEmployeeId: undefined } });
  });

  it('reuses ReportsService.tuitionOutstanding/tuitionOverdue verbatim rather than recomputing them', async () => {
    const prisma = createPrismaMock({});
    const { service, reportsService } = createService(prisma, ['tuition'], {
      reportsService: {
        tuitionOutstanding: vi.fn().mockResolvedValue({ rows: [], totalOutstanding: 500000 }),
        tuitionOverdue: vi.fn().mockResolvedValue({ rows: [], totalOverdue: 200000 }),
      },
    });

    const result = await service.getOverview('user1');

    expect(reportsService.tuitionOutstanding).toHaveBeenCalledWith({});
    expect(reportsService.tuitionOverdue).toHaveBeenCalledWith({});
    expect(result.kpis.outstandingStudentDebt).toBe(500000);
    expect(result.kpis.overdueTuition).toBe(200000);
  });

  it('computes Tuition Collected This Month as a fresh cash-basis sum (COMPLETED payments this month), not the billing-period tuitionCollected report', async () => {
    const prisma = createPrismaMock({ paymentSumThisMonth: 750000 });
    const { service } = createService(prisma, ['tuition']);

    const result = await service.getOverview('user1');

    expect(prisma.payment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ referenceType: 'TUITION_CHARGE', status: 'COMPLETED' }) }),
    );
    expect(result.kpis.tuitionCollectedThisMonth).toBe(750000);
  });



  it('treats a null aggregate sum (no rows at all) as 0, not NaN — zero-data case', async () => {
    const prisma = createPrismaMock({ paymentSumThisMonth: null });
    const { service } = createService(prisma, ['tuition']);

    const result = await service.getOverview('user1');

    expect(result.kpis.tuitionCollectedThisMonth).toBe(0);
  });



  it('narrows Upcoming Exams to the caller\'s own teacherEmployeeId when teacher-scoped', async () => {
    const prisma = createPrismaMock({ employeeId: 'emp1', teacherProfileStatus: 'ACTIVE', upcomingExamsCount: 1 });
    const { service } = createService(prisma, ['exams']);

    await service.getOverview('teacher-user-1');

    expect(prisma.exam.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ teacherEmployeeId: 'emp1' }) }));
  });

  it('computes Today\'s Attendance % and Absent Students Today from the exact same tally formula as (present+late)/total', async () => {
    const prisma = createPrismaMock({
      attendanceRecords: [{ status: 'PRESENT' }, { status: 'PRESENT' }, { status: 'ABSENT' }, { status: 'LATE' }],
    });
    const { service } = createService(prisma, ['student_attendance']);

    const result = await service.getOverview('user1');

    expect(result.kpis.absentStudentsToday).toBe(1);
    expect(result.kpis.todaysAttendancePercentage).toBe(75);
  });

  it('always includes unreadNotifications regardless of any permission (personal, never gated)', async () => {
    const prisma = createPrismaMock({});
    const { service, notificationsService } = createService(prisma, [], { notificationsService: { unreadCount: vi.fn().mockResolvedValue({ count: 7 }) } });

    const result = await service.getOverview('user1');

    expect(notificationsService.unreadCount).toHaveBeenCalledWith('user1');
    expect(result.kpis.unreadNotifications).toBe(7);
  });

  it('builds actionRequired cards only for KPIs with a positive value, each with a navigation target', async () => {
    const prisma = createPrismaMock({
      attendanceRecords: [{ status: 'ABSENT' }],
      upcomingExamsCount: 1,
    });
    const { service } = createService(prisma, ['student_attendance', 'exams'], {
      notificationsService: { unreadCount: vi.fn().mockResolvedValue({ count: 0 }) },
    });

    const result = await service.getOverview('user1');

    const keys = result.actionRequired.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['absentStudentsToday', 'upcomingExams']));
    expect(keys).not.toContain('unreadNotifications');
    for (const card of result.actionRequired) {
      expect(card.to).toMatch(/^\//);
      expect(card.value).toBeGreaterThan(0);
    }
  });

  it('never crashes on a completely empty database (zero-data case across every permitted section)', async () => {
    const prisma = createPrismaMock({});
    const { service } = createService(prisma, ALL_MODULES);

    const result = await service.getOverview('user1');

    expect(result.kpis.totalStudents).toBe(0);
    expect(result.kpis.activeGroups).toBe(0);
    expect(result.kpis.totalTeachers).toBe(0);
    expect(result.actionRequired).toEqual([]);
  });
});

describe('DashboardService.getToday', () => {
  it('returns an empty schedule and null attendance with no relevant permissions', async () => {
    const prisma = createPrismaMock({});
    const { service } = createService(prisma, []);

    const result = await service.getToday('user1');

    expect(result.schedule).toEqual([]);
    expect(result.attendance).toBeNull();
  });

  it('returns today\'s lessons ordered by scheduledStart when permitted', async () => {
    const rows = [{ id: 'l1', scheduledStart: new Date(), scheduledEnd: new Date(), status: 'SCHEDULED', group: { id: 'g1', name: 'G1' }, teacherEmployee: null, classroom: null, branch: { id: 'b1', name: 'Main' } }];
    const prisma = createPrismaMock({ scheduleRows: rows });
    const { service } = createService(prisma, ['lessons']);

    const result = await service.getToday('user1');

    expect(result.schedule).toEqual(rows);
    expect(prisma.lesson.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { scheduledStart: 'asc' } }));
  });

  it('narrows today\'s schedule and attendance to the caller\'s own lessons when teacher-scoped', async () => {
    const prisma = createPrismaMock({ employeeId: 'emp1', teacherProfileStatus: 'ACTIVE' });
    const { service } = createService(prisma, ['lessons', 'student_attendance']);

    await service.getToday('teacher-user-1');

    expect(prisma.lesson.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ teacherEmployeeId: 'emp1' }) }));
    expect(prisma.studentAttendance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ lesson: expect.objectContaining({ teacherEmployeeId: 'emp1' }) }) }));
  });

  it('computes attendance tally correctly when permitted', async () => {
    const prisma = createPrismaMock({ attendanceRecords: [{ status: 'PRESENT' }, { status: 'ABSENT' }] });
    const { service } = createService(prisma, ['student_attendance']);

    const result = await service.getToday('user1');

    expect(result.attendance).toMatchObject({ present: 1, absent: 1, total: 2, attendancePercentage: 50 });
  });
});

describe('DashboardService.getToday — recent payments', () => {
  it('omits recent payments without payments:VIEW', async () => {
    const prisma = createPrismaMock({});
    const { service } = createService(prisma, ['lessons']);

    const result = await service.getToday('user1');

    expect(result.recentPayments).toEqual([]);
  });

  it('resolves each payment\'s student name from its referenceId', async () => {
    const prisma = createPrismaMock({
      recentPayments: [
        { id: 'p1', paymentNumber: 'PAY-1', amount: '450000', method: 'CASH', status: 'COMPLETED', paidAt: new Date(), createdAt: new Date(), referenceId: 's1' },
        { id: 'p2', paymentNumber: 'PAY-2', amount: '600000', method: 'CARD', status: 'COMPLETED', paidAt: new Date(), createdAt: new Date(), referenceId: 'missing' },
      ],
    });
    prisma.student.findMany = vi.fn().mockResolvedValue([{ id: 's1', fullName: 'Muattar Abdulkhamitova' }]);
    const { service } = createService(prisma, ['payments']);

    const result = await service.getToday('user1');

    expect(result.recentPayments).toEqual([
      expect.objectContaining({ id: 'p1', amount: 450000, studentId: 's1', studentName: 'Muattar Abdulkhamitova' }),
      expect.objectContaining({ id: 'p2', amount: 600000, studentId: 'missing', studentName: null }),
    ]);
  });
});

describe('DashboardService.getCharts', () => {
  it('returns an empty object with no permissions at all', async () => {
    const prisma = createPrismaMock({});
    const { service } = createService(prisma, []);

    const result = await service.getCharts('user1');

    expect(result).toEqual({});
  });

  it('buckets studentGrowth by month with zero-fill for months with no registrations', async () => {
    const now = new Date();
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
    const prisma = createPrismaMock({ students: { growthDates: [thisMonth, thisMonth] } });
    const { service } = createService(prisma, ['students']);

    const result = await service.getCharts('user1');

    expect(result.studentGrowth).toHaveLength(6);
    const total = (result.studentGrowth as { count: number }[]).reduce((s, r) => s + r.count, 0);
    expect(total).toBe(2);
  });

  it('labels a null branchId as "Unassigned" in studentsByBranch, never dropping it', async () => {
    const prisma = createPrismaMock({ students: { byBranch: [{ branchId: 'b1', _count: { _all: 3 } }, { branchId: null, _count: { _all: 1 } }] }, branches: [{ id: 'b1', name: 'Main' }] });
    const { service } = createService(prisma, ['students']);

    const result = await service.getCharts('user1');

    expect(result.studentsByBranch).toEqual(
      expect.arrayContaining([{ branchId: 'b1', branchName: 'Main', count: 3 }, { branchId: null, branchName: 'Unassigned', count: 1 }]),
    );
  });

  it('computes groupCapacityUtilization percentage and narrows to teacher scope', async () => {
    const prisma = createPrismaMock({
      employeeId: 'emp1',
      teacherProfileStatus: 'ACTIVE',
      groups: { activeGroups: [{ id: 'g1', name: 'G1', capacity: 10, _count: { enrollments: 4 } }] },
    });
    const { service } = createService(prisma, ['groups']);

    const result = await service.getCharts('teacher-user-1');

    expect(result.groupCapacityUtilization).toEqual([{ groupId: 'g1', name: 'G1', capacity: 10, enrolledCount: 4, utilizationPercentage: 40 }]);
    expect(prisma.studentGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ teacherEmployeeId: 'emp1' }) }));
  });

  it('counts DISTINCT students per course in studentsByCourse (a student enrolled twice in one course counts once)', async () => {
    const prisma = createPrismaMock({
      enrollmentsForCourse: [
        { studentId: 's1', group: { courseId: 'c1', course: { name: 'IELTS' } } },
        { studentId: 's1', group: { courseId: 'c1', course: { name: 'IELTS' } } },
        { studentId: 's2', group: { courseId: 'c1', course: { name: 'IELTS' } } },
      ],
    });
    const { service } = createService(prisma, ['students', 'groups']);

    const result = await service.getCharts('user1');

    expect(result.studentsByCourse).toEqual([{ courseId: 'c1', courseName: 'IELTS', studentCount: 2 }]);
  });

  it('sums tuitionCollection by month from COMPLETED tuition-charge payments (cash basis)', async () => {
    const now = new Date();
    const prisma = createPrismaMock({ paymentsForChart: [{ createdAt: now, amount: '100000' }, { createdAt: now, amount: '50000' }] });
    const { service } = createService(prisma, ['tuition']);

    const result = await service.getCharts('user1');

    const thisMonthBucket = (result.tuitionCollection as { month: string; amount: number }[]).find((r) => r.month === now.toISOString().slice(0, 7));
    expect(thisMonthBucket?.amount).toBe(150000);
  });



  it('buckets academicPerformance average score by month and narrows to teacher scope', async () => {
    const now = new Date();
    const prisma = createPrismaMock({ employeeId: 'emp1', teacherProfileStatus: 'ACTIVE', assessments: [{ percentage: '80', evaluatedAt: now }, { percentage: '60', evaluatedAt: now }] });
    const { service } = createService(prisma, ['grades']);

    const result = await service.getCharts('teacher-user-1');

    const thisMonthBucket = (result.academicPerformance as { month: string; averageScore: number }[]).find((r) => r.month === now.toISOString().slice(0, 7));
    expect(thisMonthBucket?.averageScore).toBe(70);
    const emptyMonths = (result.academicPerformance as { month: string; averageScore: number | null }[]).filter((r) => r !== thisMonthBucket);
    expect(emptyMonths.every((r) => r.averageScore === null)).toBe(true);
    expect(prisma.assessment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ exam: { teacherEmployeeId: 'emp1' } }) }));
  });
});
