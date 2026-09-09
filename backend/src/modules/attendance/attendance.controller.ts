import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { toCsv } from '../reports/report-export.util.js';
import { AttendanceService } from './attendance.service.js';
import { CheckInDto } from './dto/check-in.dto.js';
import { CheckOutDto } from './dto/check-out.dto.js';
import { CreateAttendanceDto } from './dto/create-attendance.dto.js';
import { QueryAttendanceDto } from './dto/query-attendance.dto.js';
import { UpdateAttendanceDto } from './dto/update-attendance.dto.js';

type AttendanceReportType = 'summary' | 'late' | 'absence' | 'overtime' | 'employee';

@ApiTags('attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  @RequirePermission('attendance', PermissionAction.VIEW)
  findAll(@Query() query: QueryAttendanceDto) {
    return this.attendanceService.findAll(query);
  }

  @Get('overview')
  @RequirePermission('attendance', PermissionAction.VIEW)
  getOverview() {
    return this.attendanceService.getOverview();
  }

  @Get('reports')
  @RequirePermission('attendance', PermissionAction.VIEW)
  async getReport(
    @Query('type') type: AttendanceReportType,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('departmentId') departmentId: string | undefined,
    @Query('employeeId') employeeId: string | undefined,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const report = await this.attendanceService.getReport({ type, from, to, departmentId, employeeId });
    if (format === 'csv' && Array.isArray(report)) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendance-${type}.csv"`);
      return res.send(
        toCsv(
          report.map((r) => ({
            employeeCode: r.employee.employeeCode,
            employee: r.employee.fullName,
            department: r.employee.department?.name ?? '',
            workDate: r.workDate.toISOString().slice(0, 10),
            checkInAt: r.checkInAt?.toISOString() ?? '',
            checkOutAt: r.checkOutAt?.toISOString() ?? '',
            hoursWorked: r.hoursWorked?.toString() ?? '',
            lateMinutes: r.lateMinutes,
            overtimeMinutes: r.overtimeMinutes,
            status: r.status,
          })),
        ),
      );
    }
    return res.json(report);
  }

  @Get(':id')
  @RequirePermission('attendance', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.attendanceService.findOne(id);
  }

  @Post()
  @RequirePermission('attendance', PermissionAction.CREATE)
  @Audited('AttendanceRecord')
  create(@Body() dto: CreateAttendanceDto) {
    return this.attendanceService.create(dto);
  }

  @Post('check-in')
  @RequirePermission('attendance', PermissionAction.CREATE)
  @Audited('AttendanceRecord', 'CHECK_IN')
  checkIn(@Body() dto: CheckInDto) {
    return this.attendanceService.checkIn(dto);
  }

  @Post('check-out')
  @RequirePermission('attendance', PermissionAction.EDIT)
  @Audited('AttendanceRecord', 'CHECK_OUT')
  checkOut(@Body() dto: CheckOutDto) {
    return this.attendanceService.checkOut(dto);
  }

  @Patch(':id')
  @RequirePermission('attendance', PermissionAction.EDIT)
  @Audited('AttendanceRecord')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAttendanceDto) {
    return this.attendanceService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('attendance', PermissionAction.DELETE)
  @Audited('AttendanceRecord', 'DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.attendanceService.remove(id);
  }
}
