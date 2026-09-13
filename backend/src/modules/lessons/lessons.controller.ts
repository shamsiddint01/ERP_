import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { StudentAttendanceService } from '../student-attendance/student-attendance.service.js';
import { BulkMarkAttendanceDto } from '../student-attendance/dto/bulk-mark-attendance.dto.js';
import { CreateLessonDto } from './dto/create-lesson.dto.js';
import { QueryLessonDto } from './dto/query-lesson.dto.js';
import { UpdateLessonDto } from './dto/update-lesson.dto.js';
import { LessonsService } from './lessons.service.js';

@ApiTags('lessons')
@Controller('lessons')
export class LessonsController {
  constructor(
    private readonly lessonsService: LessonsService,
    private readonly studentAttendanceService: StudentAttendanceService,
  ) {}

  @Get()
  @RequirePermission('lessons', PermissionAction.VIEW)
  findAll(@Query() query: QueryLessonDto) {
    return this.lessonsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('lessons', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.lessonsService.findOne(id);
  }

  @Post()
  @RequirePermission('lessons', PermissionAction.CREATE)
  @Audited('Lesson')
  create(@Body() dto: CreateLessonDto) {
    return this.lessonsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('lessons', PermissionAction.EDIT)
  @Audited('Lesson')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLessonDto) {
    return this.lessonsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('lessons', PermissionAction.DELETE)
  @Audited('Lesson', 'CANCEL')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.lessonsService.remove(id);
  }

  @Post(':id/start')
  @RequirePermission('lessons', PermissionAction.EDIT)
  @Audited('Lesson', 'START')
  start(@Param('id', ParseUUIDPipe) id: string) {
    return this.lessonsService.start(id);
  }

  @Post(':id/complete')
  @RequirePermission('lessons', PermissionAction.EDIT)
  @Audited('Lesson', 'COMPLETE')
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.lessonsService.complete(id);
  }

  @Post(':id/cancel')
  @RequirePermission('lessons', PermissionAction.EDIT)
  @Audited('Lesson', 'CANCEL')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.lessonsService.cancel(id);
  }

  @Post(':id/no-show')
  @RequirePermission('lessons', PermissionAction.EDIT)
  @Audited('Lesson', 'NO_SHOW')
  noShow(@Param('id', ParseUUIDPipe) id: string) {
    return this.lessonsService.noShow(id);
  }

  @Post(':lessonId/attendance/bulk')
  @RequirePermission('student_attendance', PermissionAction.CREATE)
  @Audited('StudentAttendance', 'BULK_MARK')
  bulkAttendance(@Param('lessonId', ParseUUIDPipe) lessonId: string, @Body() dto: BulkMarkAttendanceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.studentAttendanceService.bulkMark(lessonId, dto.entries, user.id);
  }
}
