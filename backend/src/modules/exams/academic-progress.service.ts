import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StudentAttendanceService } from '../student-attendance/student-attendance.service.js';
import { assertTeacherScopeAllows, resolveTeacherScope } from './teacher-scope.util.js';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return round2(values.reduce((sum, v) => sum + v, 0) / values.length);
}

const GRADES_INCLUDE = {
  exam: {
    select: {
      id: true,
      title: true,
      type: true,
      date: true,
      maxScore: true,
      passingScore: true,
      status: true,
      course: { select: { id: true, name: true, code: true } },
      group: { select: { id: true, name: true, code: true, teacherEmployeeId: true } },
    },
  },
} satisfies Prisma.AssessmentInclude;

/**
 * Cross-domain academic reporting: joins Assessment (Phase H), Enrollment
 * (Phase A) and StudentAttendance (Phase F) into the read-only views the
 * spec calls for — every figure here is a live aggregation over real rows,
 * nothing inferred or predicted (no "AI analysis").
 */
@Injectable()
export class AcademicProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentAttendanceService: StudentAttendanceService,
  ) {}

  /** All of a student's assessments — "Teacher: own students" narrows this to exams in groups the acting teacher teaches, exactly like StudentAttendanceService.getStudentSummary narrows lessons (silently, never a 403 — a teacher with zero shared groups just sees an empty list). */
  async getStudentGrades(studentId: string, actorUserId: string) {
    await this.assertStudentExists(studentId);
    const teacherScope = await resolveTeacherScope(this.prisma, actorUserId);

    const assessments = await this.prisma.assessment.findMany({
      where: { studentId, ...(teacherScope && { exam: { group: { teacherEmployeeId: teacherScope } } }) },
      include: GRADES_INCLUDE,
      orderBy: { exam: { date: 'desc' } },
    });

    return {
      studentId,
      items: assessments.map((a) => ({
        id: a.id,
        examId: a.examId,
        examTitle: a.exam.title,
        examType: a.exam.type,
        examDate: a.exam.date,
        course: a.exam.course,
        group: { id: a.exam.group.id, name: a.exam.group.name, code: a.exam.group.code },
        score: Number(a.score),
        maxScore: Number(a.exam.maxScore),
        passingScore: Number(a.exam.passingScore),
        percentage: Number(a.percentage),
        grade: a.grade,
        passed: Number(a.score) >= Number(a.exam.passingScore),
        comment: a.comment,
        evaluatedAt: a.evaluatedAt,
      })),
    };
  }

  /**
   * exams/scores/average/pass rate (from Assessment), attendance percentage
   * (delegated to StudentAttendanceService — never duplicated), course
   * progress (completed vs total non-cancelled lessons per active
   * enrollment) and completed courses/groups (Enrollment.status=COMPLETED).
   */
  async getStudentProgress(studentId: string, actorUserId: string) {
    const grades = await this.getStudentGrades(studentId, actorUserId);
    const attendance = await this.studentAttendanceService.getStudentSummary(studentId, {}, actorUserId);

    const percentages = grades.items.map((i) => i.percentage);
    const passCount = grades.items.filter((i) => i.passed).length;

    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: { not: 'CANCELLED' } },
      include: { group: { select: { id: true, name: true, code: true, status: true, course: { select: { id: true, name: true } } } } },
      orderBy: { startDate: 'desc' },
    });

    const activeEnrollments = enrollments.filter((e) => e.status === 'ACTIVE' || e.status === 'PAUSED');
    const courseProgress = await Promise.all(
      activeEnrollments.map(async (enrollment) => {
        const [totalLessons, completedLessons] = await Promise.all([
          this.prisma.lesson.count({ where: { groupId: enrollment.groupId, status: { not: 'CANCELLED' } } }),
          this.prisma.lesson.count({ where: { groupId: enrollment.groupId, status: 'COMPLETED' } }),
        ]);
        return {
          enrollmentId: enrollment.id,
          groupId: enrollment.groupId,
          groupName: enrollment.group.name,
          courseId: enrollment.group.course.id,
          courseName: enrollment.group.course.name,
          totalLessons,
          completedLessons,
          progressPercentage: totalLessons > 0 ? round2((completedLessons / totalLessons) * 100) : 0,
        };
      }),
    );

    const completedGroups = enrollments
      .filter((e) => e.status === 'COMPLETED')
      .map((e) => ({
        enrollmentId: e.id,
        groupId: e.groupId,
        groupName: e.group.name,
        courseId: e.group.course.id,
        courseName: e.group.course.name,
        endDate: e.endDate,
      }));

    return {
      studentId,
      totalExams: grades.items.length,
      averagePercentage: average(percentages),
      passRate: grades.items.length > 0 ? round2((passCount / grades.items.length) * 100) : 0,
      attendancePercentage: attendance.attendancePercentage,
      courseProgress,
      completedGroups,
      recentExams: grades.items.slice(0, 10),
    };
  }

  /** Per-exam and overall stats for one group — rejects a foreign group outright (a specific-record action, mirrors StudentAttendanceService.getGroupSummary exactly), never silently narrowed. */
  async getGroupResults(groupId: string, actorUserId: string) {
    const group = await this.prisma.studentGroup.findUnique({ where: { id: groupId }, select: { id: true, name: true, teacherEmployeeId: true } });
    if (!group) throw new NotFoundException('Group not found');
    await assertTeacherScopeAllows(this.prisma, actorUserId, group.teacherEmployeeId);

    const [totalEnrolled, exams] = await Promise.all([
      this.prisma.enrollment.count({ where: { groupId, status: { not: 'CANCELLED' } } }),
      this.prisma.exam.findMany({
        where: { groupId },
        include: { assessments: { select: { score: true, percentage: true } } },
        orderBy: { date: 'desc' },
      }),
    ]);

    const examResults = exams.map((exam) => {
      const passingScore = Number(exam.passingScore);
      const scores = exam.assessments.map((a) => Number(a.score));
      const percentages = exam.assessments.map((a) => Number(a.percentage));
      const passCount = scores.filter((s) => s >= passingScore).length;
      return {
        examId: exam.id,
        title: exam.title,
        type: exam.type,
        date: exam.date,
        status: exam.status,
        maxScore: Number(exam.maxScore),
        passingScore,
        assessedCount: exam.assessments.length,
        totalEnrolled,
        average: average(percentages),
        passRate: exam.assessments.length > 0 ? round2((passCount / exam.assessments.length) * 100) : 0,
      };
    });

    const allPercentages = exams.flatMap((e) => e.assessments.map((a) => Number(a.percentage)));
    const allPassed = exams.flatMap((e) => e.assessments.filter((a) => Number(a.score) >= Number(e.passingScore)));

    return {
      groupId,
      groupName: group.name,
      totalEnrolled,
      exams: examResults,
      overallAverage: average(allPercentages),
      overallPassRate: allPercentages.length > 0 ? round2((allPassed.length / allPercentages.length) * 100) : 0,
    };
  }

  private async assertStudentExists(studentId: string): Promise<void> {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) throw new NotFoundException('Student not found');
  }
}
