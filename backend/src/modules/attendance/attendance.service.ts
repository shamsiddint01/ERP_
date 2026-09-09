import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { computeHoursWorked, computeLateMinutes, computeOvertimeMinutes, resolveWorkSchedule } from '../../shared/attendance/work-schedule.util.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { SettingsService } from '../settings/settings.service.js';
import type { CheckInDto } from './dto/check-in.dto.js';
import type { CheckOutDto } from './dto/check-out.dto.js';
import type { CreateAttendanceDto } from './dto/create-attendance.dto.js';
import type { QueryAttendanceDto } from './dto/query-attendance.dto.js';
import type { UpdateAttendanceDto } from './dto/update-attendance.dto.js';

const ATTENDANCE_INCLUDE = {
  employee: { select: { id: true, employeeCode: true, fullName: true, department: { select: { id: true, name: true } } } },
} satisfies Prisma.AttendanceRecordInclude;

/** UTC calendar-day midnight — avoids drift from the server's local timezone (same convention as DashboardService.getRevenueChart). */
function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('AttendanceRecord', (id) => this.prisma.attendanceRecord.findUnique({ where: { id } }));
  }

  async findAll(query: QueryAttendanceDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AttendanceRecordWhereInput = {
      employeeId: query.employeeId,
      status: query.status,
      ...(query.departmentId && { employee: { departmentId: query.departmentId } }),
      ...((query.from || query.to) && {
        workDate: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        include: ATTENDANCE_INCLUDE,
        orderBy: { workDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const record = await this.prisma.attendanceRecord.findUnique({ where: { id }, include: ATTENDANCE_INCLUDE });
    if (!record) throw new NotFoundException('Attendance record not found');
    return record;
  }

  /** Manual entry (backfill, absence marking, etc.) by a manager — not the check-in/check-out flow. */
  async create(dto: CreateAttendanceDto) {
    await this.assertEmployeeExists(dto.employeeId);

    const checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : undefined;
    const checkOutAt = dto.checkOutAt ? new Date(dto.checkOutAt) : undefined;
    if (checkInAt && checkOutAt && checkOutAt <= checkInAt) {
      throw new BadRequestException('checkOutAt must be after checkInAt');
    }

    const schedule = resolveWorkSchedule((await this.settingsService.get()).workScheduleSettings);
    const lateMinutes = checkInAt ? computeLateMinutes(checkInAt, schedule) : 0;
    const overtimeMinutes = checkOutAt ? computeOvertimeMinutes(checkOutAt, schedule) : 0;
    const hoursWorked = checkInAt && checkOutAt ? computeHoursWorked(checkInAt, checkOutAt) : undefined;
    const status = dto.status ?? (checkInAt ? (lateMinutes > 0 ? 'LATE' : 'PRESENT') : 'ABSENT');

    try {
      return await this.prisma.attendanceRecord.create({
        data: {
          employeeId: dto.employeeId,
          workDate: new Date(dto.workDate),
          checkInAt,
          checkOutAt,
          status,
          leaveType: dto.leaveType,
          lateMinutes,
          overtimeMinutes,
          hoursWorked,
          notes: dto.notes,
        },
        include: ATTENDANCE_INCLUDE,
      });
    } catch (error) {
      throw this.translateUniqueConstraintError(error);
    }
  }

  async update(id: string, dto: UpdateAttendanceDto) {
    const existing = await this.findOne(id);

    const checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : existing.checkInAt;
    const checkOutAt = dto.checkOutAt ? new Date(dto.checkOutAt) : existing.checkOutAt;
    if (checkInAt && checkOutAt && checkOutAt <= checkInAt) {
      throw new BadRequestException('checkOutAt must be after checkInAt');
    }

    const schedule = resolveWorkSchedule((await this.settingsService.get()).workScheduleSettings);
    const lateMinutes = checkInAt ? computeLateMinutes(checkInAt, schedule) : existing.lateMinutes;
    const overtimeMinutes = checkOutAt ? computeOvertimeMinutes(checkOutAt, schedule) : existing.overtimeMinutes;
    const hoursWorked = checkInAt && checkOutAt ? computeHoursWorked(checkInAt, checkOutAt) : existing.hoursWorked;

    return this.prisma.attendanceRecord.update({
      where: { id },
      data: {
        checkInAt: dto.checkInAt ? checkInAt : undefined,
        checkOutAt: dto.checkOutAt ? checkOutAt : undefined,
        status: dto.status,
        leaveType: dto.leaveType,
        lateMinutes,
        overtimeMinutes,
        hoursWorked,
        notes: dto.notes,
      },
      include: ATTENDANCE_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.attendanceRecord.delete({ where: { id } });
  }

  /** One check-in per employee per calendar day. Creates today's record if none exists yet. */
  async checkIn(dto: CheckInDto) {
    await this.assertEmployeeExists(dto.employeeId);

    const now = new Date();
    const workDate = utcMidnight(now);
    const schedule = resolveWorkSchedule((await this.settingsService.get()).workScheduleSettings);
    const lateMinutes = computeLateMinutes(now, schedule);

    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId: dto.employeeId, workDate } },
    });

    if (existing?.checkInAt) {
      throw new ConflictException('Employee has already checked in today');
    }

    if (existing) {
      return this.prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: { checkInAt: now, status: lateMinutes > 0 ? 'LATE' : 'PRESENT', lateMinutes, notes: dto.notes ?? existing.notes },
        include: ATTENDANCE_INCLUDE,
      });
    }

    try {
      return await this.prisma.attendanceRecord.create({
        data: {
          employeeId: dto.employeeId,
          workDate,
          checkInAt: now,
          status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
          lateMinutes,
          notes: dto.notes,
        },
        include: ATTENDANCE_INCLUDE,
      });
    } catch (error) {
      throw this.translateUniqueConstraintError(error);
    }
  }

  /** Closes out today's record — requires an existing check-in, and computes worked/overtime minutes server-side. */
  async checkOut(dto: CheckOutDto) {
    await this.assertEmployeeExists(dto.employeeId);

    const now = new Date();
    const workDate = utcMidnight(now);

    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId: dto.employeeId, workDate } },
    });
    if (!existing || !existing.checkInAt) {
      throw new BadRequestException('Cannot check out before checking in');
    }
    if (existing.checkOutAt) {
      throw new ConflictException('Employee has already checked out today');
    }
    if (now <= existing.checkInAt) {
      throw new BadRequestException('checkOutAt must be after checkInAt');
    }

    const schedule = resolveWorkSchedule((await this.settingsService.get()).workScheduleSettings);
    const overtimeMinutes = computeOvertimeMinutes(now, schedule);
    const hoursWorked = computeHoursWorked(existing.checkInAt, now);

    return this.prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: { checkOutAt: now, overtimeMinutes, hoursWorked, notes: dto.notes ?? existing.notes },
      include: ATTENDANCE_INCLUDE,
    });
  }

  /** Today's KPIs for the Attendance dashboard — computed live from today's records, never cached counters. */
  async getOverview() {
    const today = utcMidnight(new Date());
    const [totalActiveEmployees, todaysRecords] = await Promise.all([
      this.prisma.employee.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.attendanceRecord.findMany({ where: { workDate: today } }),
    ]);

    const presentToday = todaysRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const lateToday = todaysRecords.filter((r) => r.status === 'LATE').length;
    const absentToday = todaysRecords.filter((r) => r.status === 'ABSENT').length;
    const onLeaveToday = todaysRecords.filter((r) => r.status === 'ON_LEAVE').length;
    const withHours = todaysRecords.filter((r) => r.hoursWorked !== null);
    const averageWorkingHours = withHours.length
      ? Math.round((withHours.reduce((sum, r) => sum + Number(r.hoursWorked), 0) / withHours.length) * 100) / 100
      : 0;

    return { totalActiveEmployees, presentToday, lateToday, absentToday, onLeaveToday, averageWorkingHours };
  }

  /** Attendance report foundation: summary / late / absence / overtime / per-employee, all date-range filterable. */
  async getReport(params: {
    type: 'summary' | 'late' | 'absence' | 'overtime' | 'employee';
    from?: string;
    to?: string;
    departmentId?: string;
    employeeId?: string;
  }) {
    const where: Prisma.AttendanceRecordWhereInput = {
      employeeId: params.employeeId,
      ...(params.departmentId && { employee: { departmentId: params.departmentId } }),
      ...((params.from || params.to) && {
        workDate: {
          gte: params.from ? new Date(params.from) : undefined,
          lte: params.to ? new Date(params.to) : undefined,
        },
      }),
    };

    if (params.type === 'summary') {
      const [statusCounts, aggregates] = await Promise.all([
        this.prisma.attendanceRecord.groupBy({ by: ['status'], where, _count: true }),
        this.prisma.attendanceRecord.aggregate({ where, _avg: { hoursWorked: true, lateMinutes: true, overtimeMinutes: true } }),
      ]);
      return { statusCounts, averages: aggregates._avg };
    }

    if (params.type === 'late') {
      return this.prisma.attendanceRecord.findMany({ where: { ...where, status: 'LATE' }, include: ATTENDANCE_INCLUDE, orderBy: { workDate: 'desc' } });
    }
    if (params.type === 'absence') {
      return this.prisma.attendanceRecord.findMany({
        where: { ...where, status: { in: ['ABSENT', 'ON_LEAVE'] } },
        include: ATTENDANCE_INCLUDE,
        orderBy: { workDate: 'desc' },
      });
    }
    if (params.type === 'overtime') {
      return this.prisma.attendanceRecord.findMany({
        where: { ...where, overtimeMinutes: { gt: 0 } },
        include: ATTENDANCE_INCLUDE,
        orderBy: { workDate: 'desc' },
      });
    }

    // type === 'employee'
    if (!params.employeeId) throw new BadRequestException('employeeId is required for the employee report');
    return this.prisma.attendanceRecord.findMany({ where, include: ATTENDANCE_INCLUDE, orderBy: { workDate: 'desc' } });
  }

  private async assertEmployeeExists(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.deletedAt) throw new NotFoundException('Employee not found');
  }

  private translateUniqueConstraintError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('This employee already has an attendance record for that date');
    }
    return error;
  }
}
