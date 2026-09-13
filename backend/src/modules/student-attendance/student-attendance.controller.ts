import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { toCsv } from '../reports/report-export.util.js';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { CreateStudentAttendanceDto } from './dto/create-student-attendance.dto.js';
import { QueryStudentAttendanceDto } from './dto/query-student-attendance.dto.js';
import { UpdateStudentAttendanceDto } from './dto/update-student-attendance.dto.js';
import { StudentAttendanceService } from './student-attendance.service.js';

@ApiTags('student-attendance')
@Controller('student-attendance')
export class StudentAttendanceController {
  constructor(private readonly studentAttendanceService: StudentAttendanceService) {}

  @Get()
  @RequirePermission('student_attendance', PermissionAction.VIEW)
  findAll(@Query() query: QueryStudentAttendanceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.studentAttendanceService.findAll(query, user.id);
  }

  @Get('summary')
  @RequirePermission('student_attendance', PermissionAction.VIEW)
  async summary(@Query() query: QueryStudentAttendanceDto, @Query('format') format: string | undefined, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const report = await this.studentAttendanceService.getSummary(query, user.id);
    if (format === 'csv') return this.sendCsv(res, 'student-attendance-summary', [report]);
    return res.json(report);
  }

  @Get(':id')
  @RequirePermission('student_attendance', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.studentAttendanceService.findOne(id, user.id);
  }

  @Post()
  @RequirePermission('student_attendance', PermissionAction.CREATE)
  @Audited('StudentAttendance')
  create(@Body() dto: CreateStudentAttendanceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.studentAttendanceService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('student_attendance', PermissionAction.EDIT)
  @Audited('StudentAttendance', 'CORRECT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentAttendanceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.studentAttendanceService.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('student_attendance', PermissionAction.DELETE)
  @Audited('StudentAttendance', 'DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.studentAttendanceService.remove(id, user.id);
  }

  private sendCsv(res: Response, name: string, rows: Record<string, unknown>[]) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    return res.send(toCsv(rows));
  }
}
