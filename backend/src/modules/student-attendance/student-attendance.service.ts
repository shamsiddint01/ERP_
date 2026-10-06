import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StudentAttendanceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { BulkAttendanceEntryDto } from './dto/bulk-mark-attendance.dto.js';
import type { CreateStudentAttendanceDto } from './dto/create-student-attendance.dto.js';
import type { QueryStudentAttendanceDto } from './dto/query-student-attendance.dto.js';
import type { UpdateStudentAttendanceDto } from './dto/update-student-attendance.dto.js';

const ATTENDANCE_INCLUDE = {
  student: { select: { id: true, studentCode: true, fullName: true } },
  lesson: {
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      status: true,
      topic: true,
      groupId: true,
      group: { select: { id: true, name: true, code: true } },
      teacherEmployeeId: true,
      teacherEmployee: { select: { id: true, fullName: true } },
      branchId: true,
      branch: { select: { id: true, name: true, code: true } },
    },
  },
  enrollment: { select: { id: true, startDate: true, endDate: true, status: true } },
  markedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.StudentAttendanceInclude;

type AttendanceRecord = Prisma.StudentAttendanceGetPayload<{ include: typeof ATTENDANCE_INCLUDE }>;

/**
 * Attended = counts toward the numerator of the attendance percentage.
 * LATE counts as attended (the student was physically present, just tardy);
 * ABSENT and EXCUSED do not — an excused absence is still tracked separately
 * for reporting (so staff can see *why* a student missed class) but is not
 * "attendance" in the percentage sense. This is the one, single place this
 * rule is applied (mirrors the doc comment on StudentAttendanceStatus).
 */
const ATTENDED_STATUSES: ReadonlySet<StudentAttendanceStatus> = new Set(['PRESENT', 'LATE']);

/** Consecutive non-cancelled lessons, all ABSENT, that trigger the "repeated absence" alert. */
const REPEATED_ABSENCE_THRESHOLD = 3;

interface AttendanceTally {
  present: number;
  absent: number;
  late: number;
  excused: number;
}

function tally(records: Array<{ status: StudentAttendanceStatus }>): AttendanceTally {
  const counts: AttendanceTally = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of records) {
    if (r.status === 'PRESENT') counts.present++;
    else if (r.status === 'ABSENT') counts.absent++;
    else if (r.status === 'LATE') counts.late++;
    else if (r.status === 'EXCUSED') counts.excused++;
  }
  return counts;
}

/** Reads ATTENDED_STATUSES directly — used wherever the raw records are still in hand. */
function attendedCount(records: Array<{ status: StudentAttendanceStatus }>): number {
  return records.filter((r) => ATTENDED_STATUSES.has(r.status)).length;
}

/** Same rule, applied to an already-aggregated AttendanceTally (getSummary uses groupBy rather than raw records, for efficiency) — PRESENT + LATE, per ATTENDED_STATUSES. */
function attendedFromTally(counts: AttendanceTally): number {
  return counts.present + counts.late;
}

function percentage(attended: number, eligible: number): number {
  if (eligible <= 0) return 0;
  return Math.round((attended / eligible) * 10000) / 100;
}

@Injectable()
export class StudentAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('StudentAttendance', (id) => this.prisma.studentAttendance.findUnique({ where: { id } }));
  }

  async findAll(query: QueryStudentAttendanceDto, actorUserId: string): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = await this.buildWhere(query, actorUserId);

    const [items, total] = await Promise.all([
      this.prisma.studentAttendance.findMany({
        where,
        include: ATTENDANCE_INCLUDE,
        orderBy: { markedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.studentAttendance.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string, actorUserId: string) {
    const record = await this.prisma.studentAttendance.findUnique({ where: { id }, include: ATTENDANCE_INCLUDE });
    if (!record) throw new NotFoundException('Attendance record not found');
    await this.assertTeacherScopeAllows(actorUserId, record.lesson.teacherEmployeeId);
    return record;
  }

  async create(dto: CreateStudentAttendanceDto, actorUserId: string) {
    const lesson = await this.getMarkableLessonOrThrow(dto.lessonId);
    await this.assertTeacherScopeAllows(actorUserId, lesson.teacherEmployeeId);
    const enrollmentId = await this.assertEligible(lesson, dto.studentId);

    const existing = await this.prisma.studentAttendance.findUnique({
      where: { lessonId_studentId: { lessonId: dto.lessonId, studentId: dto.studentId } },
    });
    if (existing) throw new ConflictException('This student already has an attendance record for this lesson — edit it instead');

    try {
      const record = await this.prisma.studentAttendance.create({
        data: {
          lessonId: dto.lessonId,
          studentId: dto.studentId,
          enrollmentId,
          status: dto.status,
          notes: dto.notes,
          markedByUserId: actorUserId,
          markedAt: new Date(),
        },
        include: ATTENDANCE_INCLUDE,
      });
      await this.fireIndividualNotification(record);
      return record;
    } catch (error) {
      throw this.translateUniqueConstraintError(error);
    }
  }

  async update(id: string, dto: UpdateStudentAttendanceDto, actorUserId: string) {
    const existing = await this.prisma.studentAttendance.findUnique({
      where: { id },
      include: { lesson: { select: { teacherEmployeeId: true } } },
    });
    if (!existing) throw new NotFoundException('Attendance record not found');
    await this.assertTeacherScopeAllows(actorUserId, existing.lesson.teacherEmployeeId);

    const statusChanged = dto.status !== undefined && dto.status !== existing.status;
    const record = await this.prisma.studentAttendance.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes,
        // markedAt/markedBy reflect the most recent marking action — a
        // notes-only edit doesn't re-"mark" the attendance, but a status
        // correction does.
        ...(statusChanged && { markedAt: new Date(), markedByUserId: actorUserId }),
      },
      include: ATTENDANCE_INCLUDE,
    });
    if (statusChanged) await this.fireIndividualNotification(record);
    return record;
  }

  /**
   * Genuine hard delete — mirrors AttendanceRecord (Employee attendance):
   * removing a mistaken mark deletes it outright rather than transitioning a
   * status, since no status here means "this never happened". This is a
   * deliberate departure from the no-hard-delete convention used by every
   * workflow entity elsewhere in this system (Schedule/Lesson/Enrollment/
   * Group/...) — StudentAttendance has no such workflow, only corrections.
   */
  async remove(id: string, actorUserId: string) {
    const existing = await this.prisma.studentAttendance.findUnique({
      where: { id },
      include: { lesson: { select: { teacherEmployeeId: true } } },
    });
    if (!existing) throw new NotFoundException('Attendance record not found');
    await this.assertTeacherScopeAllows(actorUserId, existing.lesson.teacherEmployeeId);
    return this.prisma.studentAttendance.delete({ where: { id } });
  }

  /**
   * All-or-nothing: every entry's eligibility is checked BEFORE any write
   * happens, and every write happens inside one transaction — one ineligible
   * student anywhere in the batch fails the whole request with no partial
   * saves. Each entry is an upsert (not a plain create) so re-saving a
   * teacher's attendance sheet to correct earlier marks never errors as a
   * duplicate.
   */
  async bulkMark(lessonId: string, entries: BulkAttendanceEntryDto[], actorUserId: string) {
    const lesson = await this.getMarkableLessonOrThrow(lessonId);
    await this.assertTeacherScopeAllows(actorUserId, lesson.teacherEmployeeId);

    const studentIds = entries.map((e) => e.studentId);
    if (new Set(studentIds).size !== studentIds.length) {
      throw new BadRequestException('Duplicate studentId within the same bulk request');
    }

    const enrollmentByStudent = await this.assertAllEligible(lesson, studentIds);

    // Array-form $transaction: every upsert commits atomically together —
    // Postgres's own ON CONFLICT handling already makes each individual
    // upsert race-safe, so no extra advisory lock is needed here (unlike
    // Phase E's schedule-collision check-then-act, this is a single atomic
    // per-row DB operation, not a read-then-decide race).
    const results = await this.prisma.$transaction(
      entries.map((entry) =>
        this.prisma.studentAttendance.upsert({
          where: { lessonId_studentId: { lessonId, studentId: entry.studentId } },
          create: {
            lessonId,
            studentId: entry.studentId,
            enrollmentId: enrollmentByStudent.get(entry.studentId) ?? null,
            status: entry.status,
            notes: entry.notes,
            markedByUserId: actorUserId,
            markedAt: new Date(),
          },
          update: {
            status: entry.status,
            notes: entry.notes,
            markedByUserId: actorUserId,
            markedAt: new Date(),
          },
          include: ATTENDANCE_INCLUDE,
        }),
      ),
    );

    await this.fireBulkNotification(lessonId, results);

    // A flat spread (rather than nesting `results` under a wrapper key) is
    // deliberate: it keeps AuditInterceptor's diff meaningful for the
    // BULK_MARK action, same trick as Phase E's generate-lessons response.
    return { id: lessonId, lessonId, markedCount: results.length, results };
  }

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  /**
   * A simple breakdown of what has actually been MARKED, matching the given
   * filters — distinct from getStudentSummary/getGroupSummary below, which
   * compute the more rigorous "percentage of eligible lessons" (correctly
   * treating an unmarked lesson as not-attended, not simply excluding it).
   * Without a specific student in view, that eligibility computation isn't
   * well-defined in aggregate, so /summary reports on marked records only.
   */
  async getSummary(query: QueryStudentAttendanceDto, actorUserId: string) {
    const where = await this.buildWhere(query, actorUserId);
    const grouped = await this.prisma.studentAttendance.groupBy({ by: ['status'], where, _count: { _all: true } });

    const counts: AttendanceTally = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const g of grouped) {
      if (g.status === 'PRESENT') counts.present = g._count._all;
      else if (g.status === 'ABSENT') counts.absent = g._count._all;
      else if (g.status === 'LATE') counts.late = g._count._all;
      else if (g.status === 'EXCUSED') counts.excused = g._count._all;
    }
    const totalMarked = counts.present + counts.absent + counts.late + counts.excused;
    const attended = attendedFromTally(counts);

    return { totalMarked, ...counts, markedAttendancePercentage: percentage(attended, totalMarked) };
  }

  /**
   * eligibleLessons = non-cancelled Lessons in the student's group(s) that
   * fall within their enrollment's own valid date range — the denominator a
   * student "should" have attended, regardless of whether a teacher actually
   * got around to marking each one (an unmarked lesson is not attended).
   */
  async getStudentSummary(studentId: string, filters: { groupId?: string; dateFrom?: string; dateTo?: string }, actorUserId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) throw new NotFoundException('Student not found');

    const teacherScope = await this.resolveTeacherScope(actorUserId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, groupId: filters.groupId, status: { not: 'CANCELLED' } },
    });
    if (enrollments.length === 0) {
      return { studentId, eligibleLessons: 0, present: 0, absent: 0, late: 0, excused: 0, unmarked: 0, attendancePercentage: 0, records: [] };
    }

    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : undefined;
    const lessons = await this.prisma.lesson.findMany({
      where: {
        OR: enrollments.map((e) => ({
          groupId: e.groupId,
          scheduledStart: { gte: e.startDate, ...(e.endDate ? { lte: e.endDate } : {}) },
        })),
        status: { not: 'CANCELLED' },
        ...(teacherScope && { teacherEmployeeId: teacherScope }),
        ...((dateFrom || dateTo) && { scheduledStart: { gte: dateFrom, lte: dateTo } }),
      },
      select: { id: true, scheduledStart: true, topic: true, group: { select: { id: true, name: true, code: true } } },
      orderBy: { scheduledStart: 'desc' },
    });

    const eligibleLessonIds = lessons.map((l) => l.id);
    const attendanceByLesson = new Map(
      eligibleLessonIds.length > 0
        ? (await this.prisma.studentAttendance.findMany({ where: { studentId, lessonId: { in: eligibleLessonIds } } })).map((r) => [r.lessonId, r])
        : [],
    );
    const attendanceRecords = [...attendanceByLesson.values()];
    const counts = tally(attendanceRecords);
    const attended = attendedCount(attendanceRecords);

    // The per-lesson history the "Student attendance" page and its CSV
    // export render — an eligible lesson with no matching record shows as
    // 'UNMARKED' rather than being silently omitted, so a teacher who forgot
    // to take attendance is visible as a gap, not invisible.
    const records = lessons.map((lesson) => {
      const attendance = attendanceByLesson.get(lesson.id);
      return {
        lessonId: lesson.id,
        scheduledStart: lesson.scheduledStart,
        topic: lesson.topic,
        group: lesson.group,
        status: attendance?.status ?? 'UNMARKED',
        notes: attendance?.notes ?? null,
        attendanceId: attendance?.id ?? null,
      };
    });

    return {
      studentId,
      eligibleLessons: eligibleLessonIds.length,
      ...counts,
      unmarked: eligibleLessonIds.length - attendanceByLesson.size,
      attendancePercentage: percentage(attended, eligibleLessonIds.length),
      records,
    };
  }

  /** Per-student attendance breakdown for one group — the "class report" a teacher/manager opens to see the whole roster at a glance. */
  async getGroupSummary(groupId: string, filters: { dateFrom?: string; dateTo?: string }, actorUserId: string) {
    const group = await this.prisma.studentGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');

    const teacherScope = await this.resolveTeacherScope(actorUserId);
    if (teacherScope && group.teacherEmployeeId !== teacherScope) {
      throw new ForbiddenException('You can only view attendance for your own groups');
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: { groupId, status: { not: 'CANCELLED' } },
      include: { student: { select: { id: true, studentCode: true, fullName: true } } },
      orderBy: { student: { fullName: 'asc' } },
    });

    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : undefined;
    const lessons = await this.prisma.lesson.findMany({
      where: { groupId, status: { not: 'CANCELLED' }, ...((dateFrom || dateTo) && { scheduledStart: { gte: dateFrom, lte: dateTo } }) },
      select: { id: true, scheduledStart: true },
    });

    const lessonIds = lessons.map((l) => l.id);
    const allRecords = lessonIds.length > 0 ? await this.prisma.studentAttendance.findMany({ where: { lessonId: { in: lessonIds } } }) : [];
    const recordsByStudent = new Map<string, typeof allRecords>();
    for (const record of allRecords) {
      const list = recordsByStudent.get(record.studentId) ?? [];
      list.push(record);
      recordsByStudent.set(record.studentId, list);
    }

    const students = enrollments.map((enrollment) => {
      const eligible = lessons.filter((l) => l.scheduledStart >= enrollment.startDate && (!enrollment.endDate || l.scheduledStart <= enrollment.endDate));
      const eligibleIds = new Set(eligible.map((l) => l.id));
      const records = (recordsByStudent.get(enrollment.studentId) ?? []).filter((r) => eligibleIds.has(r.lessonId));
      const counts = tally(records);
      const attended = attendedCount(records);
      return {
        student: enrollment.student,
        enrollmentId: enrollment.id,
        eligibleLessons: eligible.length,
        ...counts,
        unmarked: eligible.length - records.length,
        attendancePercentage: percentage(attended, eligible.length),
      };
    });

    return { groupId, groupName: group.name, totalLessons: lessons.length, students };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async buildWhere(query: QueryStudentAttendanceDto, actorUserId: string): Promise<Prisma.StudentAttendanceWhereInput> {
    const teacherScope = await this.resolveTeacherScope(actorUserId);

    const lessonFilter: Prisma.LessonWhereInput = {};
    if (query.groupId) lessonFilter.groupId = query.groupId;
    if (query.teacherEmployeeId) lessonFilter.teacherEmployeeId = query.teacherEmployeeId;
    if (query.branchId) lessonFilter.branchId = query.branchId;
    if (query.dateFrom || query.dateTo) {
      lessonFilter.scheduledStart = {
        gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
        lte: query.dateTo ? new Date(query.dateTo) : undefined,
      };
    }
    // A teacher's own scope always wins — silently narrows the view to their
    // own lessons regardless of what teacherEmployeeId (if any) was asked
    // for, rather than rejecting the request ("Teacher: view own groups").
    if (teacherScope) lessonFilter.teacherEmployeeId = teacherScope;

    return {
      studentId: query.studentId,
      lessonId: query.lessonId,
      status: query.status,
      ...(Object.keys(lessonFilter).length > 0 && { lesson: lessonFilter }),
    };
  }

  private async getMarkableLessonOrThrow(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (lesson.status === 'CANCELLED') throw new ConflictException('Cannot mark attendance for a cancelled lesson');
    return lesson;
  }

  /**
   * "student is enrolled in that group" + "enrollment is valid for lesson
   * date": an Enrollment for (studentId, lesson.groupId) whose date range
   * covers the lesson's date and whose status isn't CANCELLED (a cancelled
   * enrollment never really happened, even if its dates would otherwise
   * match). Returns the matching enrollment's id (most recent start date
   * first, in the rare case more than one matches).
   */
  private async assertEligible(lesson: { groupId: string; scheduledStart: Date }, studentId: string): Promise<string> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        groupId: lesson.groupId,
        status: { not: 'CANCELLED' },
        startDate: { lte: lesson.scheduledStart },
        OR: [{ endDate: null }, { endDate: { gte: lesson.scheduledStart } }],
      },
      orderBy: { startDate: 'desc' },
    });
    if (!enrollment) throw new BadRequestException("This student is not enrolled in the lesson's group for this date");
    return enrollment.id;
  }

  /** Batched version of assertEligible for bulk marking — one query instead of N. */
  private async assertAllEligible(lesson: { groupId: string; scheduledStart: Date }, studentIds: string[]): Promise<Map<string, string>> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId: { in: studentIds },
        groupId: lesson.groupId,
        status: { not: 'CANCELLED' },
        startDate: { lte: lesson.scheduledStart },
        OR: [{ endDate: null }, { endDate: { gte: lesson.scheduledStart } }],
      },
      orderBy: { startDate: 'desc' },
    });

    const byStudent = new Map<string, string>();
    for (const e of enrollments) if (!byStudent.has(e.studentId)) byStudent.set(e.studentId, e.id);

    const ineligible = studentIds.filter((id) => !byStudent.has(id));
    if (ineligible.length > 0) {
      throw new BadRequestException(`These students are not enrolled in this lesson's group for this date: ${ineligible.join(', ')}`);
    }
    return byStudent;
  }

  /**
   * Resolves the acting user's own teacherEmployeeId if — and only if —
   * they genuinely ARE a teacher (their linked Employee has an ACTIVE
   * TeacherProfile). Returns null for everyone else (managers, admins,
   * reception, accountants, or a user with no linked Employee at all), who
   * are never scoped by this mechanism — RBAC permissions alone govern them.
   */
  private async resolveTeacherScope(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) return null;
    const profile = await this.prisma.teacherProfile.findUnique({ where: { employeeId: user.employeeId }, select: { status: true } });
    if (!profile || profile.status !== 'ACTIVE') return null;
    return user.employeeId;
  }

  /** Specific-record actions (create/update/delete/bulk/findOne) reject a foreign lesson outright, rather than silently narrowing like the list views do. */
  private async assertTeacherScopeAllows(userId: string, lessonTeacherEmployeeId: string | null): Promise<void> {
    const teacherScope = await this.resolveTeacherScope(userId);
    if (!teacherScope) return;
    if (lessonTeacherEmployeeId !== teacherScope) {
      throw new ForbiddenException('You can only manage attendance for lessons you teach');
    }
  }

  private async fireIndividualNotification(record: AttendanceRecord): Promise<void> {
    if (record.status !== 'ABSENT') return;
    const dateLabel = record.lesson.scheduledStart.toISOString().slice(0, 10);
    await this.notifications.notifyByPermission('student_attendance', 'EDIT', {
      type: 'STUDENT_ABSENT',
      title: "O'quvchi darsga kelmadi",
      message: `${record.student.fullName} — ${record.lesson.group.name} guruhida ${dateLabel} kuni darsga kelmadi.`,
      referenceType: 'StudentAttendance',
      referenceId: record.id,
      actionUrl: `/lessons/${record.lessonId}/attendance`,
    });
    await this.maybeFireRepeatedAbsenceAlert(record.studentId, record.lesson.groupId, record.student.fullName, record.lesson.group.name);
  }

  /** One consolidated notification per bulk save (never one per student) — the actual spam-avoidance mechanism for a class-sized batch. */
  private async fireBulkNotification(lessonId: string, results: AttendanceRecord[]): Promise<void> {
    const absent = results.filter((r) => r.status === 'ABSENT');
    const late = results.filter((r) => r.status === 'LATE');
    if (absent.length === 0 && late.length === 0) return;

    const groupName = results[0]?.lesson.group.name ?? '';
    const parts: string[] = [];
    if (absent.length > 0) parts.push(`${absent.length} ta kelmadi`);
    if (late.length > 0) parts.push(`${late.length} ta kech qoldi`);

    await this.notifications.notifyByPermission('student_attendance', 'EDIT', {
      type: absent.length > 0 ? 'STUDENT_ABSENT' : 'STUDENT_LATE',
      title: 'Davomat belgilandi',
      message: `${groupName} guruhi darsida: ${parts.join(', ')}.`,
      referenceType: 'Lesson',
      referenceId: lessonId,
      actionUrl: `/lessons/${lessonId}/attendance`,
    });

    for (const record of absent) {
      await this.maybeFireRepeatedAbsenceAlert(record.studentId, record.lesson.groupId, record.student.fullName, record.lesson.group.name);
    }
  }

  /** Fires once a student hits REPEATED_ABSENCE_THRESHOLD consecutive ABSENT marks in a row for the same group — deduped by NotificationsService itself (same recipient/type/referenceId, unread) so it doesn't re-fire on every subsequent absence until someone reads it. */
  private async maybeFireRepeatedAbsenceAlert(studentId: string, groupId: string, studentName: string, groupName: string): Promise<void> {
    const recentLessons = await this.prisma.lesson.findMany({
      where: { groupId, status: { not: 'CANCELLED' } },
      orderBy: { scheduledStart: 'desc' },
      take: REPEATED_ABSENCE_THRESHOLD,
      select: { id: true },
    });
    if (recentLessons.length < REPEATED_ABSENCE_THRESHOLD) return;

    const records = await this.prisma.studentAttendance.findMany({
      where: { studentId, lessonId: { in: recentLessons.map((l) => l.id) } },
      select: { status: true },
    });
    const allAbsent = records.length === REPEATED_ABSENCE_THRESHOLD && records.every((r) => r.status === 'ABSENT');
    if (!allAbsent) return;

    await this.notifications.notifyByPermission('student_attendance', 'EDIT', {
      type: 'STUDENT_REPEATED_ABSENCE',
      title: 'Takroriy davomatsizlik',
      message: `${studentName} — ${groupName} guruhida ketma-ket ${REPEATED_ABSENCE_THRESHOLD} darsga kelmadi.`,
      severity: 'CRITICAL',
      referenceType: 'Student',
      referenceId: studentId,
      actionUrl: `/students/${studentId}?tab=attendance`,
    });
  }

  private translateUniqueConstraintError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('This student already has an attendance record for this lesson — edit it instead');
    }
    return error;
  }
}
