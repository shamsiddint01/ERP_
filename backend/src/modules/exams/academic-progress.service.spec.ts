import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AcademicProgressService } from './academic-progress.service.js';

function fakeAssessment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    examId: 'exam1',
    score: '80',
    percentage: '80',
    grade: 'B',
    comment: null,
    evaluatedAt: new Date('2026-09-10'),
    exam: {
      id: 'exam1',
      title: 'Midterm',
      type: 'MIDTERM',
      date: new Date('2026-09-10'),
      maxScore: '100',
      passingScore: '60',
      status: 'COMPLETED',
      course: { id: 'course1', name: 'IELTS', code: 'IELTS' },
      group: { id: 'group1', name: 'IELTS Weekend', code: 'IELTS-02', teacherEmployeeId: 'teacher1' },
    },
    ...overrides,
  };
}

function createPrismaMock(opts: { assessments?: unknown[]; student?: unknown; enrollments?: unknown[]; lessonCounts?: [number, number]; group?: unknown; exams?: unknown[]; enrollmentCount?: number; user?: unknown; teacherProfile?: unknown } = {}) {
  // NB: `??` treats an explicitly-passed `null` (simulating "not found") as
  // absent — use `in` throughout so the not-found test paths actually work.
  const student = 'student' in opts ? opts.student : { id: 'student1' };
  const group = 'group' in opts ? opts.group : { id: 'group1', name: 'IELTS Weekend', teacherEmployeeId: 'teacher1' };
  const [totalLessons, completedLessons] = opts.lessonCounts ?? [10, 5];
  return {
    assessment: { findMany: vi.fn().mockResolvedValue(opts.assessments ?? [fakeAssessment()]) },
    student: { findUnique: vi.fn().mockResolvedValue(student) },
    enrollment: {
      findMany: vi.fn().mockResolvedValue(opts.enrollments ?? []),
      count: vi.fn().mockResolvedValue(opts.enrollmentCount ?? 0),
    },
    lesson: { count: vi.fn().mockResolvedValueOnce(totalLessons).mockResolvedValueOnce(completedLessons) },
    studentGroup: { findUnique: vi.fn().mockResolvedValue(group) },
    exam: { findMany: vi.fn().mockResolvedValue(opts.exams ?? []) },
    user: { findUnique: vi.fn().mockResolvedValue(opts.user ?? { employeeId: null }) },
    teacherProfile: { findUnique: vi.fn().mockResolvedValue(opts.teacherProfile ?? { status: 'ACTIVE' }) },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>, attendanceOverrides: Record<string, unknown> = {}) {
  const studentAttendanceService = {
    getStudentSummary: vi.fn().mockResolvedValue({ attendancePercentage: 92.5, ...attendanceOverrides }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new AcademicProgressService(prisma as any, studentAttendanceService as any), studentAttendanceService };
}

describe('AcademicProgressService.getStudentGrades', () => {
  it('throws NotFoundException for a non-existent student', async () => {
    const prisma = createPrismaMock({ student: null });
    const { service } = createService(prisma);
    await expect(service.getStudentGrades('missing', 'user1')).rejects.toThrow(NotFoundException);
  });

  it('returns real, non-invented per-exam figures straight from Assessment rows', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);
    const result = await service.getStudentGrades('student1', 'user1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ examId: 'exam1', score: 80, maxScore: 100, percentage: 80, grade: 'B', passed: true });
  });

  it('silently narrows a scoped teacher to only exams in groups they teach', async () => {
    const prisma = createPrismaMock({ user: { employeeId: 'teacher1' } });
    const { service } = createService(prisma);
    await service.getStudentGrades('student1', 'teacher-user-1');
    expect(prisma.assessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ exam: { group: { teacherEmployeeId: 'teacher1' } } }) }),
    );
  });
});

describe('AcademicProgressService.getStudentProgress', () => {
  it('computes average/passRate from real assessments and delegates attendance to StudentAttendanceService', async () => {
    const prisma = createPrismaMock({
      assessments: [fakeAssessment({ percentage: '80' }), fakeAssessment({ id: 'a2', percentage: '40', score: '40', exam: { ...fakeAssessment().exam, passingScore: '60' } })],
    });
    const { service, studentAttendanceService } = createService(prisma);

    const progress = await service.getStudentProgress('student1', 'user1');

    expect(progress.totalExams).toBe(2);
    expect(progress.averagePercentage).toBe(60); // (80 + 40) / 2
    expect(progress.passRate).toBe(50); // 1 of 2 passed (40 < 60 passingScore)
    expect(progress.attendancePercentage).toBe(92.5);
    expect(studentAttendanceService.getStudentSummary).toHaveBeenCalledWith('student1', {}, 'user1');
  });

  it('computes course progress as completedLessons/totalLessons for each ACTIVE/PAUSED enrollment', async () => {
    const prisma = createPrismaMock({
      assessments: [],
      enrollments: [
        {
          id: 'enr1',
          groupId: 'group1',
          status: 'ACTIVE',
          endDate: null,
          group: { id: 'group1', name: 'IELTS Weekend', course: { id: 'course1', name: 'IELTS' } },
        },
      ],
      lessonCounts: [10, 4],
    });
    const { service } = createService(prisma);

    const progress = await service.getStudentProgress('student1', 'user1');

    expect(progress.courseProgress).toEqual([
      expect.objectContaining({ groupId: 'group1', totalLessons: 10, completedLessons: 4, progressPercentage: 40 }),
    ]);
  });

  it('lists COMPLETED enrollments as completed groups/courses', async () => {
    const prisma = createPrismaMock({
      assessments: [],
      enrollments: [
        {
          id: 'enr2',
          groupId: 'group2',
          status: 'COMPLETED',
          endDate: new Date('2026-06-01'),
          group: { id: 'group2', name: 'Old Group', course: { id: 'course2', name: 'General English' } },
        },
      ],
    });
    const { service } = createService(prisma);

    const progress = await service.getStudentProgress('student1', 'user1');

    expect(progress.completedGroups).toEqual([
      expect.objectContaining({ groupId: 'group2', groupName: 'Old Group', courseName: 'General English' }),
    ]);
    expect(progress.courseProgress).toEqual([]);
  });

  it('never divides by zero: 0 exams -> 0 average/passRate, 0 lessons -> 0 progressPercentage', async () => {
    const prisma = createPrismaMock({
      assessments: [],
      enrollments: [{ id: 'enr1', groupId: 'group1', status: 'ACTIVE', endDate: null, group: { id: 'group1', name: 'X', course: { id: 'c1', name: 'Y' } } }],
      lessonCounts: [0, 0],
    });
    const { service } = createService(prisma);

    const progress = await service.getStudentProgress('student1', 'user1');

    expect(progress.averagePercentage).toBe(0);
    expect(progress.passRate).toBe(0);
    expect(progress.courseProgress[0]).toMatchObject({ progressPercentage: 0 });
  });
});

describe('AcademicProgressService.getGroupResults', () => {
  it('throws NotFoundException for a non-existent group', async () => {
    const prisma = createPrismaMock({ group: null });
    const { service } = createService(prisma);
    await expect(service.getGroupResults('missing', 'user1')).rejects.toThrow(NotFoundException);
  });

  it('rejects a scoped teacher viewing a foreign group outright (specific-record action, not silently narrowed)', async () => {
    const prisma = createPrismaMock({ group: { id: 'group1', name: 'X', teacherEmployeeId: 'someone-else' }, user: { employeeId: 'teacher1' } });
    const { service } = createService(prisma);
    await expect(service.getGroupResults('group1', 'teacher-user-1')).rejects.toThrow(ForbiddenException);
  });

  it('aggregates per-exam average/passRate and an overall average/passRate across all exams', async () => {
    const prisma = createPrismaMock({
      enrollmentCount: 20,
      exams: [
        {
          id: 'exam1',
          title: 'Quiz 1',
          type: 'QUIZ',
          date: new Date('2026-09-01'),
          status: 'COMPLETED',
          maxScore: '100',
          passingScore: '60',
          assessments: [
            { score: '80', percentage: '80' },
            { score: '40', percentage: '40' },
          ],
        },
      ],
    });
    const { service } = createService(prisma);

    const results = await service.getGroupResults('group1', 'user1');

    expect(results.totalEnrolled).toBe(20);
    expect(results.exams[0]).toMatchObject({ examId: 'exam1', assessedCount: 2, average: 60, passRate: 50 });
    expect(results.overallAverage).toBe(60);
    expect(results.overallPassRate).toBe(50);
  });
});
