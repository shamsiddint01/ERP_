import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { toCsv } from '../reports/report-export.util.js';
import { AttendanceDateRangeDto } from '../student-attendance/dto/attendance-date-range.dto.js';
import { StudentAttendanceService } from '../student-attendance/student-attendance.service.js';
import { CreateGroupDto } from './dto/create-group.dto.js';
import { QueryGroupDto } from './dto/query-group.dto.js';
import { UpdateGroupDto } from './dto/update-group.dto.js';
import { GroupsService } from './groups.service.js';

@ApiTags('groups')
@Controller('groups')
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly studentAttendanceService: StudentAttendanceService,
  ) {}

  @Get()
  @RequirePermission('groups', PermissionAction.VIEW)
  findAll(@Query() query: QueryGroupDto) {
    return this.groupsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('groups', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupsService.findOne(id);
  }

  @Post()
  @RequirePermission('groups', PermissionAction.CREATE)
  @Audited('StudentGroup')
  create(@Body() dto: CreateGroupDto) {
    return this.groupsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('groups', PermissionAction.EDIT)
  @Audited('StudentGroup')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGroupDto) {
    return this.groupsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('groups', PermissionAction.DELETE)
  @Audited('StudentGroup', 'CANCEL')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupsService.remove(id);
  }

  @Get(':id/attendance')
  @RequirePermission('student_attendance', PermissionAction.VIEW)
  async attendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AttendanceDateRangeDto,
    @Query('format') format: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const report = await this.studentAttendanceService.getGroupSummary(id, query, user.id);
    if (format === 'csv') {
      const rows = report.students.map((s) => ({
        studentCode: s.student.studentCode,
        studentName: s.student.fullName,
        eligibleLessons: s.eligibleLessons,
        present: s.present,
        absent: s.absent,
        late: s.late,
        excused: s.excused,
        unmarked: s.unmarked,
        attendancePercentage: s.attendancePercentage,
      }));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="group-${id}-attendance.csv"`);
      return res.send(toCsv(rows));
    }
    return res.json(report);
  }
}
