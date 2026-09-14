import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { CreateScheduleDto } from './dto/create-schedule.dto.js';
import { GenerateLessonsDto } from './dto/generate-lessons.dto.js';
import { QueryScheduleDto } from './dto/query-schedule.dto.js';
import { UpdateScheduleDto } from './dto/update-schedule.dto.js';
import { LessonGenerationService } from './lesson-generation.service.js';
import { SchedulesService } from './schedules.service.js';

@ApiTags('schedules')
@Controller('schedules')
export class SchedulesController {
  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly lessonGenerationService: LessonGenerationService,
  ) {}

  @Get()
  @RequirePermission('schedules', PermissionAction.VIEW)
  findAll(@Query() query: QueryScheduleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.schedulesService.findAll(query, user.id);
  }

  @Get(':id')
  @RequirePermission('schedules', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedulesService.findOne(id);
  }

  @Post()
  @RequirePermission('schedules', PermissionAction.CREATE)
  @Audited('Schedule')
  create(@Body() dto: CreateScheduleDto) {
    return this.schedulesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('schedules', PermissionAction.EDIT)
  @Audited('Schedule')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateScheduleDto) {
    return this.schedulesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('schedules', PermissionAction.DELETE)
  @Audited('Schedule', 'CANCEL')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedulesService.remove(id);
  }

  @Post(':id/generate-lessons')
  @RequirePermission('schedules', PermissionAction.EDIT)
  @Audited('Schedule', 'GENERATE_LESSONS')
  generateLessons(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GenerateLessonsDto) {
    return this.lessonGenerationService.generateForSchedule(id, dto);
  }
}
