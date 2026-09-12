import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ScheduleDayOfWeek } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { GenerateLessonsDto } from './dto/generate-lessons.dto.js';

const DAY_TO_INDEX: Record<ScheduleDayOfWeek, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

/** No explicit toDate defaults to roughly one term (~3 months) of generated lessons. */
const DEFAULT_GENERATION_WEEKS = 12;
/** Hard safety cap, even with an explicit toDate — a fat-fingered far-future date can never silently materialize years of Lesson rows in one call. */
const MAX_GENERATION_WEEKS = 52;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Turns one Schedule's weekly recurrence into concrete Lesson rows over a
 * date range — the only place that translates "a schedule" into "sessions".
 * Kept as its own service (rather than a method on SchedulesService) since it
 * is the sole owner of the recurrence math and is the natural seam if a
 * second RecurrenceType is ever added (spec: weekly-only for Phase E).
 */
@Injectable()
export class LessonGenerationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent by construction: `createMany({ skipDuplicates: true })` relies
   * on the DB-level `@@unique([scheduleId, scheduledStart])` constraint, so
   * calling this repeatedly — or with a range that overlaps a previous call —
   * never creates duplicate Lessons; already-generated dates are silently
   * skipped rather than re-created or duplicated.
   *
   * All date/day-of-week math below reads and constructs dates via UTC
   * getters/`Date.UTC()` exclusively — the same convention already
   * established by shared/attendance/work-schedule.util.ts's
   * scheduleTimeOnDay() and AttendanceService.utcMidnight() — so the
   * generated instants never drift depending on the host process's local
   * timezone.
   */
  async generateForSchedule(scheduleId: string, dto: GenerateLessonsDto) {
    const schedule = await this.prisma.schedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException('Schedule not found');
    if (schedule.status !== 'ACTIVE') {
      throw new ConflictException(`Cannot generate lessons for a ${schedule.status.toLowerCase()} schedule`);
    }

    let rangeStart = dto.fromDate ? this.parseDateOrThrow(dto.fromDate, 'fromDate') : schedule.startDate;
    if (rangeStart < schedule.startDate) rangeStart = schedule.startDate;

    let rangeEnd = dto.toDate
      ? this.parseDateOrThrow(dto.toDate, 'toDate')
      : new Date(rangeStart.getTime() + DEFAULT_GENERATION_WEEKS * 7 * MS_PER_DAY);
    if (schedule.endDate && schedule.endDate < rangeEnd) rangeEnd = schedule.endDate;

    if (rangeEnd < rangeStart) {
      throw new BadRequestException("toDate must not be before fromDate (or before the schedule's own start date)");
    }
    const spanWeeks = (rangeEnd.getTime() - rangeStart.getTime()) / (MS_PER_DAY * 7);
    if (spanWeeks > MAX_GENERATION_WEEKS) {
      throw new BadRequestException(`Cannot generate more than ${MAX_GENERATION_WEEKS} weeks of lessons in a single request`);
    }

    const targetDayIndex = DAY_TO_INDEX[schedule.dayOfWeek];
    const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
    const [endHour, endMinute] = schedule.endTime.split(':').map(Number);

    const dates: Date[] = [];
    const cursor = new Date(rangeStart);
    while (cursor.getUTCDay() !== targetDayIndex) cursor.setUTCDate(cursor.getUTCDate() + 1);
    while (cursor.getTime() <= rangeEnd.getTime()) {
      dates.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }

    if (dates.length === 0) {
      return { ...schedule, generatedCount: 0, skippedCount: 0, lessons: [] };
    }

    const rows = dates.map((date) => ({
      groupId: schedule.groupId,
      scheduleId: schedule.id,
      teacherEmployeeId: schedule.teacherEmployeeId,
      classroomId: schedule.classroomId,
      branchId: schedule.branchId,
      scheduledStart: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), startHour, startMinute, 0, 0)),
      scheduledEnd: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), endHour, endMinute, 0, 0)),
    }));

    const created = await this.prisma.lesson.createMany({ data: rows, skipDuplicates: true });

    const lessons = await this.prisma.lesson.findMany({
      where: { scheduleId: schedule.id, scheduledStart: { in: rows.map((r) => r.scheduledStart) } },
      orderBy: { scheduledStart: 'asc' },
    });

    // Spreading the (unchanged) raw `schedule` row alongside the generation
    // stats keeps AuditInterceptor's diff clean: every Schedule-shaped field
    // matches the "before" snapshot exactly (nothing on the Schedule itself
    // changed) so only generatedCount/skippedCount show up as new — same
    // trick EnrollmentsService.transfer() uses for the same reason.
    return { ...schedule, generatedCount: created.count, skippedCount: rows.length - created.count, lessons };
  }

  private parseDateOrThrow(value: string, field: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`Invalid ${field}`);
    return date;
  }
}
