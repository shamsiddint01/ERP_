import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicProgressService } from '../exams/academic-progress.service.js';
import { EXTRA_LESSON_INCLUDE } from '../extra-lessons/extra-lessons.service.js';
import { StudentAttendanceService } from '../student-attendance/student-attendance.service.js';
import { StudentFinanceService } from '../tuition/student-finance.service.js';
import type { SubmitHomeworkDto } from './dto/submit-homework.dto.js';

/** Enrollments that make a group "mine" for a student: homework, lessons and exams of these groups are visible. */
const CURRENT_ENROLLMENT = ['ACTIVE', 'PAUSED'] as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Everything a logged-in student sees about themselves. Every method first
 * resolves the caller's OWN Student record from their user id, and every
 * query is pinned to that student id — a student can never pass another
 * student's id anywhere in this API.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentFinance: StudentFinanceService,
    private readonly academicProgress: AcademicProgressService,
    private readonly studentAttendance: StudentAttendanceService,
  ) {}

  async resolveStudent(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true, studentCode: true, firstName: true, lastName: true, fullName: true, phone: true, email: true, status: true, registrationDate: true, branch: { select: { id: true, name: true } } },
    });
    if (!student) throw new ForbiddenException("Bu bo'lim faqat o'quvchilar uchun");
    return student;
  }

  private async myGroupIds(studentId: string): Promise<string[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: { in: [...CURRENT_ENROLLMENT] } },
      select: { groupId: true },
    });
    return [...new Set(enrollments.map((e) => e.groupId))];
  }

  async getOverview(userId: string) {
    const student = await this.resolveStudent(userId);
    const groupIds = await this.myGroupIds(student.id);
    const now = new Date();

    const [balance, nextLessons, homework, nextExam, attendance, extraLessons] = await Promise.all([
      this.studentFinance.getBalance(student.id),
      this.prisma.lesson.findMany({
        where: { groupId: { in: groupIds }, scheduledEnd: { gte: now }, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
        select: { id: true, scheduledStart: true, scheduledEnd: true, topic: true, status: true, group: { select: { id: true, name: true } }, classroom: { select: { name: true } }, teacherEmployee: { select: { fullName: true } } },
        orderBy: { scheduledStart: 'asc' },
        take: 5,
      }),
      this.prisma.homework.findMany({
        where: { groupId: { in: groupIds }, submissions: { none: { studentId: student.id } } },
        select: { id: true, title: true, dueDate: true, group: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.exam.findFirst({
        where: { groupId: { in: groupIds }, status: 'SCHEDULED', date: { gte: new Date(now.toDateString()) } },
        select: { id: true, title: true, date: true, type: true, group: { select: { name: true } } },
        orderBy: { date: 'asc' },
      }),
      this.studentAttendance.getStudentSummary(student.id, {}, userId),
      this.prisma.extraLessonRegistration.findMany({
        where: { studentId: student.id, extraLesson: { startsAt: { gte: now }, status: 'SCHEDULED' } },
        select: { extraLesson: { select: { id: true, title: true, startsAt: true, endsAt: true } } },
        orderBy: { extraLesson: { startsAt: 'asc' } },
      }),
    ]);

    return {
      student,
      balance,
      nextLessons,
      pendingHomework: { count: homework.length, overdue: homework.filter((h) => h.dueDate < now).length, items: homework.slice(0, 4) },
      nextExam,
      attendancePercentage: attendance.attendancePercentage,
      myExtraLessons: extraLessons.map((r) => r.extraLesson),
    };
  }

  async getHomework(userId: string) {
    const student = await this.resolveStudent(userId);
    const groupIds = await this.myGroupIds(student.id);
    const homework = await this.prisma.homework.findMany({
      where: { OR: [{ groupId: { in: groupIds } }, { submissions: { some: { studentId: student.id } } }] },
      include: {
        group: { select: { id: true, name: true, course: { select: { name: true } } } },
        createdBy: { select: { fullName: true } },
        submissions: { where: { studentId: student.id }, select: { id: true, answerText: true, link: true, status: true, submittedAt: true, score: true, feedback: true, gradedAt: true } },
      },
      orderBy: { dueDate: 'desc' },
    });
    const now = new Date();
    return homework.map(({ submissions, ...h }) => {
      const submission = submissions[0] ?? null;
      return {
        ...h,
        submission,
        state: submission ? (submission.status === 'GRADED' ? 'GRADED' : 'SUBMITTED') : h.dueDate < now ? 'OVERDUE' : 'PENDING',
        late: submission ? submission.submittedAt > h.dueDate : false,
      };
    });
  }

  /** Create or replace the caller's own answer — allowed after the due date (marked late), but never once it has been graded. */
  async submitHomework(userId: string, homeworkId: string, dto: SubmitHomeworkDto) {
    const student = await this.resolveStudent(userId);
    const homework = await this.prisma.homework.findUnique({ where: { id: homeworkId }, select: { id: true, groupId: true } });
    if (!homework) throw new NotFoundException('Uy ishi topilmadi');
    const groupIds = await this.myGroupIds(student.id);
    if (!groupIds.includes(homework.groupId)) throw new ForbiddenException('Bu uy ishi sizning guruhingizga tegishli emas');

    const existing = await this.prisma.homeworkSubmission.findUnique({ where: { homeworkId_studentId: { homeworkId, studentId: student.id } } });
    if (existing?.status === 'GRADED') throw new ConflictException("Baholangan uy ishini o'zgartirib bo'lmaydi");

    const data = { answerText: dto.answerText.trim(), link: dto.link || null, submittedAt: new Date() };
    return existing
      ? this.prisma.homeworkSubmission.update({ where: { id: existing.id }, data })
      : this.prisma.homeworkSubmission.create({ data: { ...data, homeworkId, studentId: student.id } });
  }

  async getGroups(userId: string) {
    const student = await this.resolveStudent(userId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: student.id, status: { not: 'CANCELLED' }, group: { deletedAt: null } },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        group: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
            startDate: true,
            endDate: true,
            course: { select: { id: true, name: true } },
            branch: { select: { name: true, address: true } },
            classroom: { select: { name: true } },
            teacherEmployee: { select: { fullName: true, phone: true } },
            schedules: {
              where: { status: 'ACTIVE' },
              select: { id: true, dayOfWeek: true, startTime: true, endTime: true, classroom: { select: { name: true } } },
              orderBy: { startTime: 'asc' },
            },
            _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });
    return enrollments;
  }

  async getPayments(userId: string) {
    const student = await this.resolveStudent(userId);
    const summary = await this.studentFinance.getFinancialSummary(student.id);
    return {
      balance: summary.balance,
      charges: summary.charges.map((c) => ({
        id: c.id,
        billingPeriod: c.billingPeriod,
        group: c.enrollment.group,
        amount: c.amount,
        discountAmount: c.discountAmount,
        netAmount: c.netAmount,
        dueDate: c.dueDate,
        status: c.status,
        allocatedAmount: c.allocatedAmount,
        outstanding: c.outstanding,
      })),
      payments: summary.payments
        .filter((p) => p.status !== 'FAILED')
        .map((p) => ({ id: p.id, paymentNumber: p.paymentNumber, amount: p.amount, method: p.method, status: p.status, paidAt: p.paidAt, createdAt: p.createdAt })),
    };
  }

  async getExams(userId: string) {
    const student = await this.resolveStudent(userId);
    const groupIds = await this.myGroupIds(student.id);
    const [upcoming, grades] = await Promise.all([
      this.prisma.exam.findMany({
        where: { groupId: { in: groupIds }, status: 'SCHEDULED', date: { gte: new Date(new Date().toDateString()) } },
        select: { id: true, title: true, date: true, type: true, maxScore: true, passingScore: true, notes: true, group: { select: { name: true } }, course: { select: { name: true } } },
        orderBy: { date: 'asc' },
      }),
      this.academicProgress.getStudentGrades(student.id, userId),
    ]);
    return { upcoming, results: grades.items };
  }

  async getProgress(userId: string) {
    const student = await this.resolveStudent(userId);
    const [progress, attendance, submissions, groupIds] = await Promise.all([
      this.academicProgress.getStudentProgress(student.id, userId),
      this.studentAttendance.getStudentSummary(student.id, {}, userId),
      this.prisma.homeworkSubmission.findMany({ where: { studentId: student.id }, select: { status: true, score: true, homework: { select: { maxScore: true } } } }),
      this.myGroupIds(student.id),
    ]);
    const assignedHomework = await this.prisma.homework.count({ where: { groupId: { in: groupIds } } });
    const graded = submissions.filter((s) => s.status === 'GRADED' && s.score !== null);
    const homeworkAverage = graded.length ? round2(graded.reduce((sum, s) => sum + (s.score! / s.homework.maxScore) * 100, 0) / graded.length) : null;

    return {
      ...progress,
      attendance: {
        eligibleLessons: attendance.eligibleLessons,
        present: attendance.present,
        absent: attendance.absent,
        late: attendance.late,
        excused: attendance.excused,
        attendancePercentage: attendance.attendancePercentage,
      },
      homework: { assigned: assignedHomework, submitted: submissions.length, graded: graded.length, averagePercentage: homeworkAverage },
    };
  }

  async getExtraLessons(userId: string) {
    const student = await this.resolveStudent(userId);
    const now = new Date();
    const lessons = await this.prisma.extraLesson.findMany({
      where: {
        OR: [
          { status: 'SCHEDULED', startsAt: { gte: now } },
          { registrations: { some: { studentId: student.id } }, startsAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
        ],
      },
      include: { ...EXTRA_LESSON_INCLUDE, registrations: { where: { studentId: student.id }, select: { id: true } } },
      orderBy: { startsAt: 'asc' },
    });
    return lessons.map(({ registrations, _count, ...l }) => ({
      ...l,
      registeredCount: _count.registrations,
      seatsLeft: Math.max(l.capacity - _count.registrations, 0),
      isRegistered: registrations.length > 0,
      isPast: l.startsAt < now,
    }));
  }

  /** Serialised per lesson with an advisory lock, so two students can never both take the last seat. */
  async registerExtraLesson(userId: string, extraLessonId: string) {
    const student = await this.resolveStudent(userId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('extra_lesson_register:' || ${extraLessonId}))`;
      const lesson = await tx.extraLesson.findUnique({ where: { id: extraLessonId }, include: { _count: { select: { registrations: true } } } });
      if (!lesson) throw new NotFoundException("Qo'shimcha dars topilmadi");
      if (lesson.status !== 'SCHEDULED') throw new ConflictException('Bu dars bekor qilingan yoki yakunlangan');
      if (lesson.startsAt <= new Date()) throw new ConflictException('Dars allaqachon boshlangan');
      const existing = await tx.extraLessonRegistration.findUnique({ where: { extraLessonId_studentId: { extraLessonId, studentId: student.id } } });
      if (existing) throw new ConflictException("Siz bu darsga allaqachon yozilgansiz");
      if (lesson._count.registrations >= lesson.capacity) throw new ConflictException("Bo'sh joy qolmagan");
      return tx.extraLessonRegistration.create({ data: { extraLessonId, studentId: student.id } });
    });
  }

  async cancelExtraLessonRegistration(userId: string, extraLessonId: string) {
    const student = await this.resolveStudent(userId);
    const lesson = await this.prisma.extraLesson.findUnique({ where: { id: extraLessonId }, select: { startsAt: true } });
    if (!lesson) throw new NotFoundException("Qo'shimcha dars topilmadi");
    if (lesson.startsAt <= new Date()) throw new ConflictException("Boshlangan darsdan chiqib bo'lmaydi");
    const result = await this.prisma.extraLessonRegistration.deleteMany({ where: { extraLessonId, studentId: student.id } });
    if (result.count === 0) throw new NotFoundException('Siz bu darsga yozilmagansiz');
    return { extraLessonId };
  }
}
