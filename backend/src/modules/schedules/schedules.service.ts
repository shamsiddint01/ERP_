import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, ScheduleDayOfWeek } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateScheduleDto } from './dto/create-schedule.dto.js';
import type { QueryScheduleDto } from './dto/query-schedule.dto.js';
import type { UpdateScheduleDto } from './dto/update-schedule.dto.js';

const SCHEDULE_INCLUDE = {
  group: { select: { id: true, name: true, code: true, status: true } },
  teacherEmployee: { select: { id: true, fullName: true } },
  classroom: { select: { id: true, name: true, roomNumber: true } },
  branch: { select: { id: true, name: true, code: true } },
} satisfies Prisma.ScheduleInclude;

/** A group in either of these states must never gain a new schedule (mirrors Phase D §25's enrollment rule). */
const CLOSED_GROUP_STATUSES = new Set(['COMPLETED', 'CANCELLED']);

const SORTABLE_FIELDS = new Set(['dayOfWeek', 'startTime', 'startDate', 'status', 'createdAt']);

/** Effectively "no end date" for date-range overlap arithmetic, without needing nullable comparisons on both sides. */
const FAR_FUTURE = new Date('9999-12-31');

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Schedule', (id) => this.prisma.schedule.findUnique({ where: { id } }));
  }

  async findAll(query: QueryScheduleDto, actorUserId: string): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    // "Own schedules" (Phase K): silently narrows a teacher caller to their
    // own schedules regardless of what teacherEmployeeId they pass — same
    // pattern as GroupsService.findAll/LessonsService.findAll.
    const teacherScope = await this.resolveTeacherScope(actorUserId);
    const where: Prisma.ScheduleWhereInput = {
      groupId: query.groupId,
      teacherEmployeeId: teacherScope ?? query.teacherEmployeeId,
      branchId: query.branchId,
      classroomId: query.classroomId,
      dayOfWeek: query.dayOfWeek,
      status: query.status,
      ...((query.dateFrom || query.dateTo) && {
        startDate: {
          gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
          lte: query.dateTo ? new Date(query.dateTo) : undefined,
        },
      }),
      ...(query.search && {
        OR: [
          { notes: { contains: query.search, mode: 'insensitive' } },
          { group: { name: { contains: query.search, mode: 'insensitive' } } },
          { group: { code: { contains: query.search, mode: 'insensitive' } } },
          { teacherEmployee: { fullName: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };

    // No sortBy given: keep the natural weekly-timetable order (day, then
    // time-of-day) rather than an arbitrary single-field default.
    const orderBy: Prisma.ScheduleOrderByWithRelationInput | Prisma.ScheduleOrderByWithRelationInput[] =
      query.sortBy && SORTABLE_FIELDS.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir ?? 'asc' }
        : [{ dayOfWeek: 'asc' }, { startTime: 'asc' }];

    const [items, total] = await Promise.all([
      this.prisma.schedule.findMany({
        where,
        include: SCHEDULE_INCLUDE,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.schedule.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const schedule = await this.prisma.schedule.findUnique({ where: { id }, include: SCHEDULE_INCLUDE });
    if (!schedule) throw new NotFoundException('Schedule not found');
    return schedule;
  }

  async create(dto: CreateScheduleDto) {
    await this.assertReferencesValid(dto);
    this.assertTimeValid(dto.startTime, dto.endTime);
    this.assertDatesValid(dto.startDate, dto.endDate);
    const effectiveStatus = dto.status ?? 'ACTIVE';

    return this.prisma.$transaction(async (tx) => {
      // Collision checking only matters for a schedule that is actually
      // ACTIVE — creating one directly as PAUSED/CANCELLED can never
      // conflict with anything since it never occupies its slot.
      if (effectiveStatus === 'ACTIVE') {
        await this.lockCollisionKeys(tx, dto.teacherEmployeeId, dto.classroomId);
        if (dto.teacherEmployeeId) await this.assertActiveTeacher(tx, dto.teacherEmployeeId);
        await this.assertNoCollision(tx, dto, null);
      }

      return tx.schedule.create({
        data: {
          groupId: dto.groupId,
          teacherEmployeeId: dto.teacherEmployeeId,
          classroomId: dto.classroomId,
          branchId: dto.branchId,
          dayOfWeek: dto.dayOfWeek,
          startTime: dto.startTime,
          endTime: dto.endTime,
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          recurrenceType: dto.recurrenceType,
          status: dto.status,
          notes: dto.notes,
        },
        include: SCHEDULE_INCLUDE,
      });
    });
  }

  async update(id: string, dto: UpdateScheduleDto) {
    const schedule = await this.findOne(id);
    const effective = {
      groupId: dto.groupId ?? schedule.groupId,
      teacherEmployeeId: dto.teacherEmployeeId !== undefined ? dto.teacherEmployeeId : (schedule.teacherEmployeeId ?? undefined),
      classroomId: dto.classroomId !== undefined ? dto.classroomId : (schedule.classroomId ?? undefined),
      branchId: dto.branchId ?? schedule.branchId,
      dayOfWeek: dto.dayOfWeek ?? schedule.dayOfWeek,
      startTime: dto.startTime ?? schedule.startTime,
      endTime: dto.endTime ?? schedule.endTime,
      startDate: dto.startDate ?? schedule.startDate.toISOString(),
      endDate: dto.endDate !== undefined ? dto.endDate : (schedule.endDate?.toISOString() ?? undefined),
      status: dto.status ?? schedule.status,
    };

    await this.assertReferencesValid(effective);
    this.assertTimeValid(effective.startTime, effective.endTime);
    this.assertDatesValid(effective.startDate, effective.endDate);

    return this.prisma.$transaction(async (tx) => {
      // Same rule as create(): pausing or cancelling a schedule only ever
      // frees up a slot, so it must never be blocked by a "collision" —
      // only re-validate teacher/classroom/collision when the schedule
      // is, or remains, ACTIVE.
      if (effective.status === 'ACTIVE') {
        await this.lockCollisionKeys(tx, effective.teacherEmployeeId, effective.classroomId);
        if (effective.teacherEmployeeId) await this.assertActiveTeacher(tx, effective.teacherEmployeeId);
        await this.assertNoCollision(tx, effective, id);
      }

      return tx.schedule.update({
        where: { id },
        data: {
          groupId: dto.groupId,
          teacherEmployeeId: dto.teacherEmployeeId,
          classroomId: dto.classroomId,
          branchId: dto.branchId,
          dayOfWeek: dto.dayOfWeek,
          startTime: dto.startTime,
          endTime: dto.endTime,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          recurrenceType: dto.recurrenceType,
          status: dto.status,
          notes: dto.notes,
        },
        include: SCHEDULE_INCLUDE,
      });
    });
  }

  /** No hard delete — mirrors every other lookup entity in this system: "removing" a schedule cancels it. Existing generated Lessons are historical and are never touched. */
  async remove(id: string) {
    return this.update(id, { status: 'CANCELLED' });
  }

  private async assertReferencesValid(dto: {
    groupId?: string;
    branchId?: string;
    classroomId?: string;
    teacherEmployeeId?: string;
  }): Promise<void> {
    let group: { status: string; branchId: string } | null = null;
    if (dto.groupId) {
      group = await this.prisma.studentGroup.findUnique({ where: { id: dto.groupId }, select: { status: true, branchId: true } });
      if (!group) throw new NotFoundException('Group not found');
      if (CLOSED_GROUP_STATUSES.has(group.status)) {
        throw new ConflictException(`Cannot schedule a ${group.status.toLowerCase()} group`);
      }
      // branchId is stored on Schedule too (for direct filtering without a join), but it must
      // never drift from the group's own branch — a schedule can't meet at a different branch
      // than the group it belongs to.
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
  }

  /**
   * A schedule's teacher must be an Employee with an ACTIVE TeacherProfile —
   * never an arbitrary staff member (mirrors GroupsService.assertActiveTeacher,
   * Phase D §8). Locks the profile row for the rest of the transaction so a
   * concurrent deactivation can't race past this check (Phase D §39):
   * TeachersService.update() takes a real row-level UPDATE lock on that same
   * row, so the two always serialize against each other.
   */
  private async assertActiveTeacher(tx: Prisma.TransactionClient, employeeId: string): Promise<void> {
    const employee = await tx.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.deletedAt) throw new NotFoundException('Teacher employee not found');
    if (employee.status !== 'ACTIVE') {
      throw new ConflictException('Selected employee is not an active employee (on leave, suspended, or terminated)');
    }

    // employee_id is a plain TEXT column (Prisma models String @id as text,
    // not a native Postgres uuid type) — no ::uuid cast, or Postgres refuses
    // the comparison with "operator does not exist: text = uuid".
    const rows = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM teacher_profiles WHERE employee_id = ${employeeId} FOR UPDATE
    `;
    const profile = rows[0];
    if (!profile || profile.status !== 'ACTIVE') {
      throw new ConflictException('Selected employee is not an active teacher — create or activate their teacher profile first');
    }
  }

  private assertTimeValid(startTime: string, endTime: string): void {
    if (startTime >= endTime) throw new BadRequestException('startTime must be before endTime');
  }

  private assertDatesValid(startDate: string, endDate?: string): void {
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) throw new BadRequestException('Invalid start date');
    if (!endDate) return;
    const end = new Date(endDate);
    if (Number.isNaN(end.getTime())) throw new BadRequestException('Invalid end date');
    if (end < start) throw new BadRequestException('End date must not be before the start date');
  }

  /** Serializes concurrent create/update attempts for the same teacher and/or classroom so the collision check below can never be raced past (mirrors Phase D's enrollment-capacity advisory lock). */
  private async lockCollisionKeys(tx: Prisma.TransactionClient, teacherEmployeeId?: string, classroomId?: string): Promise<void> {
    if (teacherEmployeeId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('schedule_teacher:' || ${teacherEmployeeId}))`;
    }
    if (classroomId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('schedule_classroom:' || ${classroomId}))`;
    }
  }

  /**
   * Rejects overlapping schedules for the same teacher or the same classroom
   * on the same day of week, considering both the weekly time window and the
   * schedules' active date ranges — a Monday 18:00-19:30 schedule running
   * Sep-Dec does not conflict with a Monday 18:00-19:30 schedule running the
   * following Jan-Mar. Only ACTIVE schedules can conflict (a cancelled or
   * paused one no longer occupies its slot).
   */
  private async assertNoCollision(
    tx: Prisma.TransactionClient,
    dto: {
      teacherEmployeeId?: string;
      classroomId?: string;
      dayOfWeek: ScheduleDayOfWeek;
      startTime: string;
      endTime: string;
      startDate: string;
      endDate?: string;
    },
    excludeId: string | null,
  ): Promise<void> {
    const dateRangeFilter: Prisma.ScheduleWhereInput = {
      startDate: { lte: dto.endDate ? new Date(dto.endDate) : FAR_FUTURE },
      OR: [{ endDate: null }, { endDate: { gte: new Date(dto.startDate) } }],
    };

    if (dto.teacherEmployeeId) {
      const conflict = await tx.schedule.findFirst({
        where: {
          id: excludeId ? { not: excludeId } : undefined,
          teacherEmployeeId: dto.teacherEmployeeId,
          status: 'ACTIVE',
          dayOfWeek: dto.dayOfWeek,
          startTime: { lt: dto.endTime },
          endTime: { gt: dto.startTime },
          AND: [dateRangeFilter],
        },
        include: { group: { select: { name: true } } },
      });
      if (conflict) {
        throw new ConflictException(
          `Teacher already has an overlapping schedule on ${dto.dayOfWeek} (${conflict.startTime}-${conflict.endTime}, ${conflict.group.name})`,
        );
      }
    }

    if (dto.classroomId) {
      const conflict = await tx.schedule.findFirst({
        where: {
          id: excludeId ? { not: excludeId } : undefined,
          classroomId: dto.classroomId,
          status: 'ACTIVE',
          dayOfWeek: dto.dayOfWeek,
          startTime: { lt: dto.endTime },
          endTime: { gt: dto.startTime },
          AND: [dateRangeFilter],
        },
        include: { group: { select: { name: true } } },
      });
      if (conflict) {
        throw new ConflictException(
          `Classroom is already booked on ${dto.dayOfWeek} (${conflict.startTime}-${conflict.endTime}, ${conflict.group.name})`,
        );
      }
    }
  }

  /** Mirrors exams/teacher-scope.util.ts's resolveTeacherScope exactly (duplicated per this codebase's established per-module convention). */
  private async resolveTeacherScope(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) return null;
    const profile = await this.prisma.teacherProfile.findUnique({ where: { employeeId: user.employeeId }, select: { status: true } });
    if (!profile || profile.status !== 'ACTIVE') return null;
    return user.employeeId;
  }
}
