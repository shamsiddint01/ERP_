import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EducationReportsService } from './education-reports.service.js';

function createService(
  prismaOverrides: Record<string, Record<string, ReturnType<typeof vi.fn>>>,
  serviceOverrides: { reportsService?: Record<string, unknown>; academicProgress?: Record<string, unknown> } = {},
) {
  const prisma = prismaOverrides;
  const reportsService = {
    tuitionBilled: vi.fn().mockResolvedValue({ rows: [], totalBilled: 0 }),
    tuitionCollected: vi.fn().mockResolvedValue({ rows: [], totalCollected: 0 }),
    tuitionOutstanding: vi.fn().mockResolvedValue({ rows: [], totalOutstanding: 0 }),
    tuitionOverdue: vi.fn().mockResolvedValue({ rows: [], totalOverdue: 0 }),
    tuitionCollectionRate: vi.fn().mockResolvedValue({ rows: [], collectionRate: 0 }),
    ...serviceOverrides.reportsService,
  };
  const academicProgress = {
    getStudentProgress: vi.fn().mockResolvedValue({ recentExams: [] }),
    ...serviceOverrides.academicProgress,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new EducationReportsService(prisma as any, reportsService as any, academicProgress as any);
  return { service, prisma, reportsService, academicProgress };
}

describe('EducationReportsService.getStudentsReport', () => {
  function studentsPrisma(opts: {
    total?: number;
    byStatus?: { status: string; _count: { _all: number } }[];
    byBranch?: { branchId: string | null; _count: { _all: number } }[];
    branches?: { id: string; name: string }[];
    bucketingEnrollments?: unknown[];
    registrations?: { registrationDate: Date }[];
    historyItems?: unknown[];
    historyTotal?: number;
  }) {
    return {
      student: {
        count: vi.fn().mockResolvedValue(opts.total ?? 0),
        groupBy: vi.fn().mockImplementation(({ by }: { by: string[] }) => {
          if (by[0] === 'status') return Promise.resolve(opts.byStatus ?? []);
          return Promise.resolve(opts.byBranch ?? []);
        }),
        findMany: vi.fn().mockResolvedValue(opts.registrations ?? []),
      },
      branch: { findMany: vi.fn().mockResolvedValue(opts.branches ?? []) },
      enrollment: {
        findMany: vi
          .fn()
          .mockImplementationOnce(() => Promise.resolve(opts.bucketingEnrollments ?? []))
          .mockImplementationOnce(() => Promise.resolve(opts.historyItems ?? [])),
        count: vi.fn().mockResolvedValue(opts.historyTotal ?? 0),
      },
    };
  }

  it('returns all-zero, empty-array shape on a completely empty database (zero-data case)', async () => {
    const prisma = studentsPrisma({});
    const { service } = createService(prisma);

    const report = await service.getStudentsReport({});

    expect(report.totalStudents).toBe(0);
    expect(report.activeStudents).toBe(0);
    expect(report.inactiveStudents).toBe(0);
    expect(report.byBranch).toEqual([]);
    expect(report.byCourse).toEqual([]);
    expect(report.byGroup).toEqual([]);
    expect(report.newStudentsByPeriod).toEqual([]);
    expect(report.enrollmentHistory).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    // every StudentStatus key must be present and zeroed, not just the ones seen
    expect(report.byStatus).toMatchObject({ ACTIVE: 0, INACTIVE: 0, LEFT: 0 });
  });

  it('sums ACTIVE for activeStudents and INACTIVE+LEFT for inactiveStudents', async () => {
    const prisma = studentsPrisma({
      byStatus: [
        { status: 'ACTIVE', _count: { _all: 10 } },
        { status: 'INACTIVE', _count: { _all: 3 } },
        { status: 'LEFT', _count: { _all: 2 } },
      ],
    });
    const { service } = createService(prisma);

    const report = await service.getStudentsReport({});

    expect(report.activeStudents).toBe(10);
    expect(report.inactiveStudents).toBe(5);
    expect(report.totalStudents).toBe(15);
  });

  it('rejects an invalid status value with BadRequestException instead of silently passing it to Prisma', async () => {
    const prisma = studentsPrisma({});
    const { service } = createService(prisma);

    await expect(service.getStudentsReport({ status: 'NOT_A_REAL_STATUS' })).rejects.toThrow(BadRequestException);
  });

  it('maps unassigned (null) branchId to a labeled "Unassigned" bucket rather than dropping it', async () => {
    const prisma = studentsPrisma({
      byBranch: [
        { branchId: 'b1', _count: { _all: 4 } },
        { branchId: null, _count: { _all: 1 } },
      ],
      branches: [{ id: 'b1', name: 'Main Branch' }],
    });
    const { service } = createService(prisma);

    const report = await service.getStudentsReport({});

    expect(report.byBranch).toEqual(
      expect.arrayContaining([
        { branchId: 'b1', branchName: 'Main Branch', count: 4 },
        { branchId: null, branchName: 'Unassigned', count: 1 },
      ]),
    );
  });

  it('counts byCourse/byGroup as DISTINCT students, not enrollment rows (a student with two enrollments in one group counts once)', async () => {
    const prisma = studentsPrisma({
      bucketingEnrollments: [
        { studentId: 's1', group: { id: 'g1', name: 'Group 1', courseId: 'c1', course: { id: 'c1', name: 'IELTS' } } },
        { studentId: 's1', group: { id: 'g1', name: 'Group 1', courseId: 'c1', course: { id: 'c1', name: 'IELTS' } } },
        { studentId: 's2', group: { id: 'g1', name: 'Group 1', courseId: 'c1', course: { id: 'c1', name: 'IELTS' } } },
      ],
    });
    const { service } = createService(prisma);

    const report = await service.getStudentsReport({});

    expect(report.byCourse).toEqual([{ courseId: 'c1', courseName: 'IELTS', studentCount: 2 }]);
    expect(report.byGroup).toEqual([{ groupId: 'g1', groupName: 'Group 1', studentCount: 2 }]);
  });

  it('excludes bucketing rows for a different course than the one requested (courseId filter is applied even though the fetch is unfiltered by course)', async () => {
    const prisma = studentsPrisma({
      bucketingEnrollments: [
        { studentId: 's1', group: { id: 'g1', name: 'Group 1', courseId: 'c1', course: { id: 'c1', name: 'IELTS' } } },
        { studentId: 's2', group: { id: 'g2', name: 'Group 2', courseId: 'c2', course: { id: 'c2', name: 'SAT' } } },
      ],
    });
    const { service } = createService(prisma);

    const report = await service.getStudentsReport({ courseId: 'c1' });

    expect(report.byCourse).toEqual([{ courseId: 'c1', courseName: 'IELTS', studentCount: 1 }]);
  });

  it('buckets newStudentsByPeriod by calendar month, sorted ascending', async () => {
    const prisma = studentsPrisma({
      registrations: [{ registrationDate: new Date('2026-08-15') }, { registrationDate: new Date('2026-09-01') }, { registrationDate: new Date('2026-08-02') }],
    });
    const { service } = createService(prisma);

    const report = await service.getStudentsReport({});

    expect(report.newStudentsByPeriod).toEqual([
      { period: '2026-08', count: 2 },
      { period: '2026-09', count: 1 },
    ]);
  });

  it('applies the from/to date range as the registrationDate filter passed to Prisma', async () => {
    const prisma = studentsPrisma({});
    const { service } = createService(prisma);

    await service.getStudentsReport({ from: '2026-01-01', to: '2026-01-31' });

    expect(prisma.student.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ registrationDate: expect.objectContaining({ gte: new Date('2026-01-01') }) }) }),
    );
  });
});

describe('EducationReportsService.getGroupsReport', () => {
  function fakeGroup(overrides: Record<string, unknown> = {}) {
    return {
      id: 'g1',
      name: 'IELTS Weekend',
      code: 'IELTS-01',
      capacity: 10,
      status: 'ACTIVE',
      course: { id: 'c1', name: 'IELTS' },
      branch: { id: 'b1', name: 'Main' },
      teacherEmployeeId: 't1',
      teacherEmployee: { id: 't1', fullName: 'Teacher One' },
      _count: { enrollments: 5 },
      ...overrides,
    };
  }

  function groupsPrisma(opts: { groups?: unknown[]; groupCount?: number; assessments?: unknown[] }) {
    const groups = opts.groups ?? [fakeGroup()];
    return {
      studentGroup: {
        count: vi.fn().mockResolvedValue(opts.groupCount ?? groups.length),
        findMany: vi.fn().mockResolvedValue(groups),
      },
      assessment: { findMany: vi.fn().mockResolvedValue(opts.assessments ?? []) },
    };
  }

  it('computes capacity utilization directly from the fetched page (no second full-table scan)', async () => {
    const prisma = groupsPrisma({ groups: [fakeGroup({ id: 'g1', capacity: 10, _count: { enrollments: 5 } }), fakeGroup({ id: 'g2', capacity: 20, _count: { enrollments: 4 } })] });
    const { service } = createService(prisma);

    const report = await service.getGroupsReport({});

    expect(report.studentCount).toBe(9);
    expect(report.capacityUtilization).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ groupId: 'g1', utilizationPercentage: 50 }),
        expect.objectContaining({ groupId: 'g2', utilizationPercentage: 20 }),
      ]),
    );
    expect(report.averageUtilization).toBe(35);
  });

  it('aggregates teacherWorkload per teacher across their groups', async () => {
    const prisma = groupsPrisma({
      groups: [
        fakeGroup({ id: 'g1', teacherEmployeeId: 't1', teacherEmployee: { id: 't1', fullName: 'Teacher One' }, _count: { enrollments: 5 } }),
        fakeGroup({ id: 'g2', teacherEmployeeId: 't1', teacherEmployee: { id: 't1', fullName: 'Teacher One' }, _count: { enrollments: 3 } }),
      ],
    });
    const { service } = createService(prisma);

    const report = await service.getGroupsReport({});

    expect(report.teacherWorkload).toEqual([{ teacherEmployeeId: 't1', name: 'Teacher One', groupsCount: 2, studentsCount: 8 }]);
  });

  it('computes groupPerformance via a direct assessment aggregation (never rejects for a foreign-teacher group)', async () => {
    const prisma = groupsPrisma({
      groups: [fakeGroup({ id: 'g1' }), fakeGroup({ id: 'g2', teacherEmployeeId: 't2', teacherEmployee: { id: 't2', fullName: 'Other Teacher' } })],
      assessments: [
        { score: '80', percentage: '80', exam: { groupId: 'g1', passingScore: '60' } },
        { score: '40', percentage: '40', exam: { groupId: 'g1', passingScore: '60' } },
      ],
    });
    const { service } = createService(prisma);

    // g2 belongs to a different teacher than g1 — this must NOT throw/reject.
    const report = await service.getGroupsReport({});

    const g1 = report.groupPerformance.find((g) => g.groupId === 'g1');
    const g2 = report.groupPerformance.find((g) => g.groupId === 'g2');
    expect(g1).toMatchObject({ overallAverage: 60, overallPassRate: 50, assessedCount: 2 });
    expect(g2).toMatchObject({ overallAverage: 0, overallPassRate: 0, assessedCount: 0 });
  });

  it('returns zeroed report shape with no groups (zero-data case)', async () => {
    const prisma = groupsPrisma({ groups: [], groupCount: 0 });
    const { service } = createService(prisma);

    const report = await service.getGroupsReport({});

    expect(report.groupCount).toBe(0);
    expect(report.studentCount).toBe(0);
    expect(report.averageUtilization).toBe(0);
    expect(report.teacherWorkload).toEqual([]);
    expect(report.groupPerformance).toEqual([]);
    expect(prisma.assessment.findMany).not.toHaveBeenCalled();
  });

  it('rejects an invalid group status value', async () => {
    const prisma = groupsPrisma({});
    const { service } = createService(prisma);
    await expect(service.getGroupsReport({ status: 'NOT_REAL' })).rejects.toThrow(BadRequestException);
  });

  it('passes branch/course/teacher filters straight into the Prisma where clause', async () => {
    const prisma = groupsPrisma({});
    const { service } = createService(prisma);

    await service.getGroupsReport({ branchId: 'b1', courseId: 'c1', teacherEmployeeId: 't1' });

    expect(prisma.studentGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { branchId: 'b1', courseId: 'c1', teacherEmployeeId: 't1', status: undefined } }));
  });
});

describe('EducationReportsService.getAttendanceReport', () => {
  function attendancePrisma(records: { studentId: string; status: string; lesson: { groupId: string | null; teacherEmployeeId: string | null } }[]) {
    return {
      studentAttendance: { findMany: vi.fn().mockResolvedValue(records) },
      student: { findMany: vi.fn().mockResolvedValue([{ id: 's1', studentCode: 'STU-1', fullName: 'Student One' }]) },
      studentGroup: { findMany: vi.fn().mockResolvedValue([{ id: 'g1', name: 'Group 1', code: 'G-1' }]) },
      employee: { findMany: vi.fn().mockResolvedValue([{ id: 't1', fullName: 'Teacher One' }]) },
    };
  }

  it('tallies present/absent/late/excused and computes attendancePercentage as (present+late)/total', async () => {
    const records = [
      { studentId: 's1', status: 'PRESENT', lesson: { groupId: 'g1', teacherEmployeeId: 't1' } },
      { studentId: 's1', status: 'PRESENT', lesson: { groupId: 'g1', teacherEmployeeId: 't1' } },
      { studentId: 's1', status: 'ABSENT', lesson: { groupId: 'g1', teacherEmployeeId: 't1' } },
      { studentId: 's1', status: 'LATE', lesson: { groupId: 'g1', teacherEmployeeId: 't1' } },
      { studentId: 's1', status: 'EXCUSED', lesson: { groupId: 'g1', teacherEmployeeId: 't1' } },
    ];
    const prisma = attendancePrisma(records);
    const { service } = createService(prisma);

    const report = await service.getAttendanceReport({});

    expect(report.overall).toMatchObject({ totalMarked: 5, present: 2, absent: 1, late: 1, excused: 1, attendancePercentage: 60, absenceRate: 20, lateRate: 20, excusedRate: 20 });
  });

  it('derives byStudent/byGroup/byTeacher from the SAME fetched slice (never separately queried, so they can never disagree)', async () => {
    const records = [
      { studentId: 's1', status: 'PRESENT', lesson: { groupId: 'g1', teacherEmployeeId: 't1' } },
      { studentId: 's1', status: 'ABSENT', lesson: { groupId: 'g1', teacherEmployeeId: 't1' } },
    ];
    const prisma = attendancePrisma(records);
    const { service } = createService(prisma);

    const report = await service.getAttendanceReport({});

    expect(prisma.studentAttendance.findMany).toHaveBeenCalledTimes(1);
    expect(report.byStudent).toEqual([{ student: { id: 's1', studentCode: 'STU-1', fullName: 'Student One' }, present: 1, absent: 1, late: 0, excused: 0, total: 2, attendancePercentage: 50 }]);
    expect(report.byGroup[0]).toMatchObject({ group: { id: 'g1', name: 'Group 1', code: 'G-1' }, total: 2 });
    expect(report.byTeacher[0]).toMatchObject({ teacher: { id: 't1', fullName: 'Teacher One' }, total: 2 });
  });

  it('defaults to a 90-day lookback when no explicit from/to is given (performance safety net)', async () => {
    const prisma = attendancePrisma([]);
    const { service } = createService(prisma);

    await service.getAttendanceReport({});

    const where = prisma.studentAttendance.findMany.mock.calls[0][0].where;
    const gte: Date = where.lesson.scheduledStart.gte;
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    expect(Math.abs(gte.getTime() - ninetyDaysAgo)).toBeLessThan(5000);
    expect(where.lesson.scheduledStart.lte).toBeUndefined();
  });

  it('uses the exact explicit from/to range instead of the 90-day default when either is given', async () => {
    const prisma = attendancePrisma([]);
    const { service } = createService(prisma);

    await service.getAttendanceReport({ from: '2026-01-01', to: '2026-01-31' });

    const where = prisma.studentAttendance.findMany.mock.calls[0][0].where;
    expect(where.lesson.scheduledStart.gte).toEqual(new Date('2026-01-01'));
    expect(where.lesson.scheduledStart.lte.getTime()).toBe(new Date('2026-01-31T23:59:59.999').getTime());
  });

  it('applies branch/course/group/teacher/student filters onto the lesson relation', async () => {
    const prisma = attendancePrisma([]);
    const { service } = createService(prisma);

    await service.getAttendanceReport({ branchId: 'b1', courseId: 'c1', groupId: 'g1', teacherEmployeeId: 't1', studentId: 's1' });

    expect(prisma.studentAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId: 's1', lesson: expect.objectContaining({ groupId: 'g1', teacherEmployeeId: 't1', branchId: 'b1', group: { courseId: 'c1' } }) }),
      }),
    );
  });

  it('returns an all-zero shape with no attendance records at all (zero-data case)', async () => {
    const prisma = attendancePrisma([]);
    const { service } = createService(prisma);

    const report = await service.getAttendanceReport({});

    expect(report.overall).toMatchObject({ totalMarked: 0, present: 0, absent: 0, late: 0, excused: 0, attendancePercentage: 0 });
    expect(report.byStudent).toEqual([]);
    expect(report.byGroup).toEqual([]);
    expect(report.byTeacher).toEqual([]);
  });
});

describe('EducationReportsService.getAcademicReport', () => {
  function academicPrisma(opts: { exams?: unknown[]; examsTotal?: number; assessments?: unknown[] }) {
    return {
      exam: {
        findMany: vi.fn().mockResolvedValue(opts.exams ?? []),
        count: vi.fn().mockResolvedValue(opts.examsTotal ?? 0),
      },
      assessment: { findMany: vi.fn().mockResolvedValue(opts.assessments ?? []) },
    };
  }

  it('delegates the single-student view to AcademicProgressService.getStudentProgress with the REAL actorUserId (never a fake empty string)', async () => {
    const prisma = academicPrisma({});
    const { service, academicProgress } = createService(prisma);

    const report = await service.getAcademicReport({ studentId: 's1' }, 'real-user-42');

    expect(academicProgress.getStudentProgress).toHaveBeenCalledWith('s1', 'real-user-42');
    expect(report.scope).toBe('student');
  });

  it('computes overview averageScore/passRate directly from Assessment rows, not invented', async () => {
    const prisma = academicPrisma({
      assessments: [
        { score: '80', percentage: '80', exam: { passingScore: '60', courseId: 'c1', course: { name: 'IELTS' }, groupId: 'g1', group: { name: 'Group 1' } } },
        { score: '40', percentage: '40', exam: { passingScore: '60', courseId: 'c1', course: { name: 'IELTS' }, groupId: 'g1', group: { name: 'Group 1' } } },
      ],
    });
    const { service } = createService(prisma);

    const report = await service.getAcademicReport({}, 'user1');

    expect(report.scope).toBe('overview');
    if (report.scope === 'overview') {
      expect(report.averageScore).toBe(60);
      expect(report.passRate).toBe(50);
      expect(report.coursePerformance).toEqual([{ courseId: 'c1', courseName: 'IELTS', average: 60, assessedCount: 2 }]);
      expect(report.groupPerformance).toEqual([{ groupId: 'g1', groupName: 'Group 1', average: 60, assessedCount: 2 }]);
    }
  });

  it('computes per-exam average/passRate in examResults from that exam\'s own assessments only', async () => {
    const prisma = academicPrisma({
      exams: [
        {
          id: 'exam1',
          title: 'Midterm',
          date: new Date('2026-09-01'),
          passingScore: '60',
          course: { id: 'c1', name: 'IELTS' },
          group: { id: 'g1', name: 'Group 1' },
          assessments: [{ score: '90', percentage: '90' }, { score: '30', percentage: '30' }],
        },
      ],
      examsTotal: 1,
    });
    const { service } = createService(prisma);

    const report = await service.getAcademicReport({}, 'user1');

    if (report.scope === 'overview') {
      expect(report.examResults.items[0]).toMatchObject({ examId: 'exam1', assessedCount: 2, average: 60, passRate: 50 });
    }
  });

  it('returns a zeroed overview with no exams at all (zero-data case)', async () => {
    const prisma = academicPrisma({});
    const { service } = createService(prisma);

    const report = await service.getAcademicReport({}, 'user1');

    if (report.scope === 'overview') {
      expect(report.averageScore).toBe(0);
      expect(report.passRate).toBe(0);
      expect(report.examResults.items).toEqual([]);
      expect(report.coursePerformance).toEqual([]);
    }
  });

  it('applies from/to as the exam date range filter', async () => {
    const prisma = academicPrisma({});
    const { service } = createService(prisma);

    await service.getAcademicReport({ from: '2026-01-01', to: '2026-01-31' }, 'user1');

    expect(prisma.exam.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ date: expect.objectContaining({ gte: new Date('2026-01-01') }) }) }));
  });
});

describe('EducationReportsService.getTuitionReport', () => {
  function tuitionPrisma(paymentGroups: { method: string; _sum: { amount: string }; _count: { _all: number } }[]) {
    return { payment: { groupBy: vi.fn().mockResolvedValue(paymentGroups) } };
  }

  it('reuses ReportsService.tuitionBilled/Collected/Outstanding/Overdue/CollectionRate verbatim rather than recomputing them', async () => {
    const prisma = tuitionPrisma([]);
    const { service, reportsService } = createService(prisma);

    await service.getTuitionReport({ from: '2026-09-01', to: '2026-09-30' });

    expect(reportsService.tuitionBilled).toHaveBeenCalledWith(expect.objectContaining({ billingPeriodFrom: '2026-09', billingPeriodTo: '2026-09' }));
    expect(reportsService.tuitionCollected).toHaveBeenCalled();
    expect(reportsService.tuitionOutstanding).toHaveBeenCalled();
    expect(reportsService.tuitionOverdue).toHaveBeenCalled();
    expect(reportsService.tuitionCollectionRate).toHaveBeenCalled();
  });

  it('builds paymentMethodBreakdown from a groupBy scoped to COMPLETED tuition-charge payments', async () => {
    const prisma = tuitionPrisma([{ method: 'CASH', _sum: { amount: '500000' }, _count: { _all: 3 } }]);
    const { service } = createService(prisma);

    const report = await service.getTuitionReport({});

    expect(report.paymentMethodBreakdown.CASH).toEqual({ count: 3, amount: 500000 });
    expect(report.paymentMethodBreakdown.CARD).toEqual({ count: 0, amount: 0 });
    expect(prisma.payment.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ referenceType: 'TUITION_CHARGE', status: 'COMPLETED' }) }));
  });
});

describe('EducationReportsService.getTeachersReport', () => {
  function teachersPrisma(opts: { profiles?: unknown[]; total?: number; lessons?: unknown[]; attendanceAgg?: { status: string; _count: { _all: number } }[] }) {
    return {
      teacherProfile: {
        findMany: vi.fn().mockResolvedValue(opts.profiles ?? []),
        count: vi.fn().mockResolvedValue(opts.total ?? 0),
      },
      studentGroup: { count: vi.fn().mockResolvedValue(2) },
      enrollment: { count: vi.fn().mockResolvedValue(15) },
      lesson: { findMany: vi.fn().mockResolvedValue(opts.lessons ?? []) },
      studentAttendance: { groupBy: vi.fn().mockResolvedValue(opts.attendanceAgg ?? []) },
    };
  }


  it('computes hours from scheduledStart/scheduledEnd of COMPLETED lessons only', async () => {
    const prisma = teachersPrisma({
      profiles: [{ id: 'p1', employeeId: 't1', employee: { id: 't1', fullName: 'Teacher One', employeeCode: 'EMP-1' } }],
      lessons: [
        { scheduledStart: new Date('2026-09-01T10:00:00Z'), scheduledEnd: new Date('2026-09-01T11:30:00Z') },
        { scheduledStart: new Date('2026-09-02T10:00:00Z'), scheduledEnd: new Date('2026-09-02T11:00:00Z') },
      ],
    });
    const { service } = createService(prisma);

    const report = await service.getTeachersReport({});

    expect(report.items[0]).toMatchObject({ lessonCount: 2, hours: 2.5 });
    expect(prisma.lesson.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'COMPLETED' }) }));
  });

  it('computes attendancePercentage as (present+late)/total across that teacher\'s lessons', async () => {
    const prisma = teachersPrisma({
      profiles: [{ id: 'p1', employeeId: 't1', employee: { id: 't1', fullName: 'Teacher One', employeeCode: 'EMP-1' } }],
      attendanceAgg: [
        { status: 'PRESENT', _count: { _all: 8 } },
        { status: 'LATE', _count: { _all: 2 } },
        { status: 'ABSENT', _count: { _all: 10 } },
      ],
    });
    const { service } = createService(prisma);

    const report = await service.getTeachersReport({});

    expect(report.items[0].attendance).toEqual({ total: 20, percentage: 50 });
  });

  it('returns an empty items array with no teacher profiles at all (zero-data case)', async () => {
    const prisma = teachersPrisma({ profiles: [], total: 0 });
    const { service } = createService(prisma);

    const report = await service.getTeachersReport({});

    expect(report.items).toEqual([]);
    expect(report.total).toBe(0);
  });
});

describe('EducationReportsService.getBranchesReport', () => {
  function branchesPrisma(opts: {
    branches?: { id: string; name: string }[];
    studentsCount?: number;
    groups?: { id: string; teacherEmployeeId: string | null }[];
    tuitionCharges?: { netAmount: string; allocations: { amount: string }[] }[];
    attendanceAgg?: { status: string; _count: { _all: number } }[];
  }) {
    return {
      branch: { findMany: vi.fn().mockResolvedValue(opts.branches ?? [{ id: 'b1', name: 'Main Branch' }]) },
      student: { count: vi.fn().mockResolvedValue(opts.studentsCount ?? 0) },
      studentGroup: { findMany: vi.fn().mockResolvedValue(opts.groups ?? []) },
      tuitionCharge: { findMany: vi.fn().mockResolvedValue(opts.tuitionCharges ?? []) },
      studentAttendance: { groupBy: vi.fn().mockResolvedValue(opts.attendanceAgg ?? []) },
    };
  }

  it('sums billed from netAmount and collected from allocation amounts on the SAME charges', async () => {
    const prisma = branchesPrisma({
      tuitionCharges: [
        { netAmount: '500000', allocations: [{ amount: '200000' }] },
        { netAmount: '300000', allocations: [] },
      ],
    });
    const { service } = createService(prisma);

    const report = await service.getBranchesReport({});

    expect(report.items[0].tuition).toEqual({ billed: 800000, collected: 200000 });
  });

  it('counts DISTINCT teachers, not groups (two groups taught by the same teacher count as one)', async () => {
    const prisma = branchesPrisma({ groups: [{ id: 'g1', teacherEmployeeId: 't1' }, { id: 'g2', teacherEmployeeId: 't1' }, { id: 'g3', teacherEmployeeId: null }] });
    const { service } = createService(prisma);

    const report = await service.getBranchesReport({});

    expect(report.items[0].teachers).toBe(1);
    expect(report.items[0].groups).toBe(3);
  });

  it('skips the attendance aggregate query entirely when a branch has zero groups (no wasted query)', async () => {
    const prisma = branchesPrisma({ groups: [] });
    const { service } = createService(prisma);

    const report = await service.getBranchesReport({});

    expect(prisma.studentAttendance.groupBy).not.toHaveBeenCalled();
    expect(report.items[0].attendance).toEqual({ totalMarked: 0, percentage: 0 });
  });

  it('returns an empty items array when the branchId filter matches nothing (zero-data case)', async () => {
    const prisma = branchesPrisma({ branches: [] });
    const { service } = createService(prisma);

    const report = await service.getBranchesReport({ branchId: 'does-not-exist' });

    expect(report.items).toEqual([]);
  });
});

describe('EducationReportsService.getDashboardData', () => {
  it('composes the same five report methods with an empty query and never recomputes a figure a second way', async () => {
    const prisma = {
      student: { count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
      branch: { findMany: vi.fn().mockResolvedValue([]) },
      enrollment: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      studentGroup: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
      assessment: { findMany: vi.fn().mockResolvedValue([]) },
      studentAttendance: { findMany: vi.fn().mockResolvedValue([]) },
      exam: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      payment: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    const { service, academicProgress } = createService(prisma);

    const dashboard = await service.getDashboardData();

    expect(dashboard).toMatchObject({ totalStudents: 0, activeStudents: 0, groupCount: 0, attendancePercentage: 0, averageScore: 0, passRate: 0, tuitionBilled: 0, tuitionCollected: 0, tuitionOutstanding: 0 });
    // the studentId-dependent branch must never be taken for the dashboard's empty query
    expect(academicProgress.getStudentProgress).not.toHaveBeenCalled();
  });
});
