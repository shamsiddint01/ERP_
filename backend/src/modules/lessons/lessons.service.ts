import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LessonStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateLessonDto } from './dto/create-lesson.dto.js';
import type { QueryLessonDto } from './dto/query-lesson.dto.js';
import type { UpdateLessonDto } from './dto/update-lesson.dto.js';

const LESSON_INCLUDE = {
  group: { select: { id: true, name: true, code: true } },
  schedule: { select: { id: true, dayOfWeek: true, startTime: true, endTime: true } },
  teacherEmployee: { select: { id: true, fullName: true } },
  classroom: { select: { id: true, name: true, roomNumber: true } },
  branch: { select: { id: true, name: true, code: true } },
} satisfies Prisma.LessonInclude;

/** A group in either of these states must never gain a new lesson (mirrors SchedulesService/Phase D §25). */
const CLOSED_GROUP_STATUSES = new Set(['COMPLETED', 'CANCELLED']);

/** Once a lesson lands in one of these, its "when/who/where" facts are historical and locked — only topic/homework/notes may still be edited. */
const LOCKED_STATUSES = new Set<LessonStatus>(['COMPLETED', 'CANCELLED']);

/** A cancelled lesson gave up its slot — it can never block a new one from taking it. Every other status still occupies the slot. */
const NON_BLOCKING_STATUSES: LessonStatus[] = ['CANCELLED'];

const SORTABLE_FIELDS = new Set(['scheduledStart', 'status', 'createdAt']);

interface CollisionCheckInput {
  teacherEmployeeId?: string;
  classroomId?: string;
  scheduledStart: Date;
  scheduledEnd: Date;
}

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Lesson', (id) => this.prisma.lesson.findUnique({ where: { id } }));
  }

  async findAll(query: QueryLessonDto, actorUserId: string): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy && SORTABLE_FIELDS.has(query.sortBy) ? query.sortBy : 'scheduledStart';
    const sortDir = query.sortDir ?? 'desc';

    // "Own lessons" (Phase K): silently narrows a teacher caller regardless
    // of what teacherEmployeeId they pass — same pattern as GroupsService/
    // SchedulesService.findAll.
    const teacherScope = await this.resolveTeacherScope(actorUserId);
    const where: Prisma.LessonWhereInput = {
      groupId: query.groupId,
      scheduleId: query.scheduleId,
      teacherEmployeeId: teacherScope ?? query.teacherEmployeeId,
      classroomId: query.classroomId,
      branchId: query.branchId,
      status: query.status,
      ...((query.dateFrom || query.dateTo) && {
        scheduledStart: {
          gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
          lte: query.dateTo ? new Date(query.dateTo) : undefined,
        },
      }),
      ...(query.search && {
        OR: [
          { topic: { contains: query.search, mode: 'insensitive' } },
          { homework: { contains: query.search, mode: 'insensitive' } },
          { notes: { contains: query.search, mode: 'insensitive' } },
          { group: { name: { contains: query.search, mode: 'insensitive' } } },
          { group: { code: { contains: query.search, mode: 'insensitive' } } },
          { teacherEmployee: { fullName: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.lesson.findMany({
        where,
        include: LESSON_INCLUDE,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lesson.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id }, include: LESSON_INCLUDE });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  /** Manually creating a one-off lesson (make-up class, trial lesson) — bulk generation from a Schedule goes through LessonGenerationService instead. */
  async create(dto: CreateLessonDto) {
    await this.assertReferencesValid(dto);
    const scheduledStart = new Date(dto.scheduledStart);
    const scheduledEnd = new Date(dto.scheduledEnd);
    if (Number.isNaN(scheduledStart.getTime())) throw new BadRequestException('Invalid scheduledStart');
    if (Number.isNaN(scheduledEnd.getTime())) throw new BadRequestException('Invalid scheduledEnd');
    if (scheduledStart >= scheduledEnd) throw new BadRequestException('scheduledStart must be before scheduledEnd');

    return this.prisma.$transaction(async (tx) => {
      await this.lockCollisionKeys(tx, dto.teacherEmployeeId, dto.classroomId);
      if (dto.teacherEmployeeId) await this.assertActiveTeacher(tx, dto.teacherEmployeeId);
      await this.assertNoCollision(tx, { teacherEmployeeId: dto.teacherEmployeeId, classroomId: dto.classroomId, scheduledStart, scheduledEnd }, null);

      try {
        return await tx.lesson.create({
          data: {
            groupId: dto.groupId,
            scheduleId: dto.scheduleId,
            teacherEmployeeId: dto.teacherEmployeeId,
            classroomId: dto.classroomId,
            branchId: dto.branchId,
            scheduledStart,
            scheduledEnd,
            topic: dto.topic,
            homework: dto.homework,
            notes: dto.notes,
          },
          include: LESSON_INCLUDE,
        });
      } catch (error) {
        throw this.translateUniqueConstraintError(error);
      }
    });
  }

  /**
   * Rescheduling (teacher/classroom/time) is only allowed while the lesson is
   * still SCHEDULED or IN_PROGRESS; a COMPLETED/CANCELLED lesson is a
   * historical record — only its descriptive fields (topic/homework/notes,
   * e.g. filled in by the teacher right after class) may still change.
   */
  async update(id: string, dto: UpdateLessonDto, actorUserId: string) {
    const lesson = await this.findOne(id);
    await this.assertTeacherScopeAllows(actorUserId, lesson.teacherEmployeeId);
    const changesSchedulingFields =
      dto.teacherEmployeeId !== undefined || dto.classroomId !== undefined || dto.scheduledStart !== undefined || dto.scheduledEnd !== undefined;
    if (changesSchedulingFields && LOCKED_STATUSES.has(lesson.status)) {
      throw new ConflictException(`Cannot reschedule a ${lesson.status.toLowerCase()} lesson — only topic, homework and notes may still be edited`);
    }

    const effective = {
      teacherEmployeeId: dto.teacherEmployeeId !== undefined ? dto.teacherEmployeeId : (lesson.teacherEmployeeId ?? undefined),
      classroomId: dto.classroomId !== undefined ? dto.classroomId : (lesson.classroomId ?? undefined),
      scheduledStart: dto.scheduledStart ? new Date(dto.scheduledStart) : lesson.scheduledStart,
      scheduledEnd: dto.scheduledEnd ? new Date(dto.scheduledEnd) : lesson.scheduledEnd,
    };
    if (dto.scheduledStart && Number.isNaN(effective.scheduledStart.getTime())) throw new BadRequestException('Invalid scheduledStart');
    if (dto.scheduledEnd && Number.isNaN(effective.scheduledEnd.getTime())) throw new BadRequestException('Invalid scheduledEnd');
    if (effective.scheduledStart >= effective.scheduledEnd) throw new BadRequestException('scheduledStart must be before scheduledEnd');

    if (dto.classroomId) {
      const classroom = await this.prisma.classroom.findUnique({ where: { id: dto.classroomId } });
      if (!classroom) throw new NotFoundException('Classroom not found');
      if (classroom.branchId !== lesson.branchId) {
        throw new BadRequestException("Selected classroom does not belong to this lesson's branch");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (changesSchedulingFields) {
        await this.lockCollisionKeys(tx, effective.teacherEmployeeId, effective.classroomId);
        if (effective.teacherEmployeeId) await this.assertActiveTeacher(tx, effective.teacherEmployeeId);
        await this.assertNoCollision(tx, effective, id);
      }

      try {
        return await tx.lesson.update({
          where: { id },
          data: {
            teacherEmployeeId: dto.teacherEmployeeId,
            classroomId: dto.classroomId,
            scheduledStart: dto.scheduledStart ? effective.scheduledStart : undefined,
            scheduledEnd: dto.scheduledEnd ? effective.scheduledEnd : undefined,
            topic: dto.topic,
            homework: dto.homework,
            notes: dto.notes,
          },
          include: LESSON_INCLUDE,
        });
      } catch (error) {
        throw this.translateUniqueConstraintError(error);
      }
    });
  }

  /** No hard delete — mirrors every other entity in this system: "removing" a lesson cancels it through the same guarded workflow transition as the /cancel action. */
  async remove(id: string, actorUserId: string) {
    return this.cancel(id, actorUserId);
  }

  async start(id: string, actorUserId: string) {
    return this.transitionTo(id, actorUserId, ['SCHEDULED'], 'IN_PROGRESS', { actualStart: new Date() });
  }

  /** Completable directly from SCHEDULED too (teachers often log a lesson as done after the fact, without ever clicking "start"). Backfills actualStart to the scheduled time when it was never set. */
  async complete(id: string, actorUserId: string) {
    const lesson = await this.findOne(id);
    await this.assertTeacherScopeAllows(actorUserId, lesson.teacherEmployeeId);
    if (lesson.status !== 'SCHEDULED' && lesson.status !== 'IN_PROGRESS') {
      throw new ConflictException(`Cannot complete a lesson that is ${lesson.status}`);
    }
    await this.casUpdate(id, lesson.status, { status: 'COMPLETED', actualStart: lesson.actualStart ?? lesson.scheduledStart, actualEnd: new Date() });
    return this.findOne(id);
  }

  async cancel(id: string, actorUserId: string) {
    return this.transitionTo(id, actorUserId, ['SCHEDULED', 'IN_PROGRESS'], 'CANCELLED');
  }

  private async transitionTo(id: string, actorUserId: string, allowedFrom: LessonStatus[], to: LessonStatus, extraData: Prisma.LessonUpdateInput = {}) {
    const lesson = await this.findOne(id);
    await this.assertTeacherScopeAllows(actorUserId, lesson.teacherEmployeeId);
    if (!allowedFrom.includes(lesson.status)) {
      throw new ConflictException(`Cannot move a lesson from ${lesson.status} to ${to}`);
    }
    await this.casUpdate(id, lesson.status, { status: to, ...extraData });
    return this.findOne(id);
  }

  /** Mirrors exams/teacher-scope.util.ts's resolveTeacherScope exactly (duplicated per this codebase's established per-module convention). */
  private async resolveTeacherScope(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) return null;
    const profile = await this.prisma.teacherProfile.findUnique({ where: { employeeId: user.employeeId }, select: { status: true } });
    if (!profile || profile.status !== 'ACTIVE') return null;
    return user.employeeId;
  }

  /** A teacher may only start/complete/cancel/reschedule their OWN lessons — a specific-record action rejects a foreign one outright (mirrors StudentAttendanceService/ExamsService, never silently narrows like a list view would). */
  private async assertTeacherScopeAllows(userId: string, lessonTeacherEmployeeId: string | null): Promise<void> {
    const teacherScope = await this.resolveTeacherScope(userId);
    if (!teacherScope) return;
    if (lessonTeacherEmployeeId !== teacherScope) {
      throw new ForbiddenException('You can only manage your own lessons');
    }
  }

  /** updateMany + count-check compare-and-swap: guards every workflow transition against a concurrent change to the same lesson (mirrors EnrollmentsService.transitionTo). */
  private async casUpdate(id: string, expectedStatus: LessonStatus, data: Prisma.LessonUpdateInput): Promise<void> {
    const result = await this.prisma.lesson.updateMany({ where: { id, status: expectedStatus }, data });
    if (result.count === 0) throw new ConflictException('This lesson was changed concurrently — please retry');
  }

  private async assertReferencesValid(dto: { groupId?: string; branchId?: string; classroomId?: string; scheduleId?: string }): Promise<void> {
    if (dto.groupId) {
      const group = await this.prisma.studentGroup.findUnique({ where: { id: dto.groupId }, select: { status: true, branchId: true } });
      if (!group) throw new NotFoundException('Group not found');
      if (CLOSED_GROUP_STATUSES.has(group.status)) {
        throw new ConflictException(`Cannot create a lesson for a ${group.status.toLowerCase()} group`);
      }
      // branchId is stored on Lesson too (for direct filtering without a join), but it must
      // never drift from the group's own branch (mirrors SchedulesService.assertReferencesValid).
      if (dto.branchId && group.branchId !== dto.branchId) {
        throw new BadRequestException("Selected branch does not match the group's own branch");
      }
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch) throw new NotFoundException('Branch not found');
    }
    if (dto.classroomId) {
      const classroom = await this.prisma.classroom.findUnique({ where: { id: dto.classroomId } });
      if (!classroom) throw new NotFoundException('Classroom not found');
      if (dto.branchId && classroom.branchId !== dto.branchId) {
        throw new BadRequestException('Selected classroom does not belong to the selected branch');
      }
    }
    if (dto.scheduleId) {
      const schedule = await this.prisma.schedule.findUnique({ where: { id: dto.scheduleId } });
      if (!schedule) throw new NotFoundException('Schedule not found');
    }
  }

  /** Mirrors SchedulesService.assertActiveTeacher exactly — see that method's comment for why this needs a real row-level FOR UPDATE lock. */
  private async assertActiveTeacher(tx: Prisma.TransactionClient, employeeId: string): Promise<void> {
    const employee = await tx.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.deletedAt) throw new NotFoundException('Teacher employee not found');
    if (employee.status !== 'ACTIVE') {
      throw new ConflictException('Selected employee is not an active employee (on leave, suspended, or terminated)');
    }

    const rows = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM teacher_profiles WHERE employee_id = ${employeeId} FOR UPDATE
    `;
    const profile = rows[0];
    if (!profile || profile.status !== 'ACTIVE') {
      throw new ConflictException('Selected employee is not an active teacher — create or activate their teacher profile first');
    }
  }

  /** Serializes concurrent create/reschedule attempts for the same teacher and/or classroom (mirrors SchedulesService.lockCollisionKeys — separate lock namespace so the two never needlessly block each other). */
  private async lockCollisionKeys(tx: Prisma.TransactionClient, teacherEmployeeId?: string, classroomId?: string): Promise<void> {
    if (teacherEmployeeId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lesson_teacher:' || ${teacherEmployeeId}))`;
    }
    if (classroomId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lesson_classroom:' || ${classroomId}))`;
    }
  }

  /**
   * Rejects a teacher or classroom double-booking against any OTHER lesson
   * (from any schedule, or none) whose actual [scheduledStart, scheduledEnd)
   * interval overlaps this one. Only used for manual create/reschedule —
   * LessonGenerationService's bulk path deliberately skips this because the
   * generating Schedule was already proven collision-free at the Schedule
   * level, so every date it produces is collision-free by construction
   * against every other *generated* lesson; only a manually created ad-hoc
   * lesson could still overlap one, which is exactly what this guards.
   */
  private async assertNoCollision(tx: Prisma.TransactionClient, input: CollisionCheckInput, excludeId: string | null): Promise<void> {
    if (input.teacherEmployeeId) {
      const conflict = await tx.lesson.findFirst({
        where: {
          id: excludeId ? { not: excludeId } : undefined,
          teacherEmployeeId: input.teacherEmployeeId,
          status: { notIn: NON_BLOCKING_STATUSES },
          scheduledStart: { lt: input.scheduledEnd },
          scheduledEnd: { gt: input.scheduledStart },
        },
        include: { group: { select: { name: true } } },
      });
      if (conflict) {
        throw new ConflictException(`Teacher already has an overlapping lesson at this time (${conflict.group.name})`);
      }
    }

    if (input.classroomId) {
      const conflict = await tx.lesson.findFirst({
        where: {
          id: excludeId ? { not: excludeId } : undefined,
          classroomId: input.classroomId,
          status: { notIn: NON_BLOCKING_STATUSES },
          scheduledStart: { lt: input.scheduledEnd },
          scheduledEnd: { gt: input.scheduledStart },
        },
        include: { group: { select: { name: true } } },
      });
      if (conflict) {
        throw new ConflictException(`Classroom is already booked at this time (${conflict.group.name})`);
      }
    }
  }

  private translateUniqueConstraintError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('A lesson for this schedule at this exact time already exists');
    }
    return error;
  }
}
