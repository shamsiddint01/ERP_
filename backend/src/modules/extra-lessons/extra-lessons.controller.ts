import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { CreateExtraLessonDto } from './dto/create-extra-lesson.dto.js';
import { QueryExtraLessonDto } from './dto/query-extra-lesson.dto.js';
import { UpdateExtraLessonDto } from './dto/update-extra-lesson.dto.js';
import { ExtraLessonsService } from './extra-lessons.service.js';

@ApiTags('extra-lessons')
@Controller('extra-lessons')
export class ExtraLessonsController {
  constructor(private readonly extraLessonsService: ExtraLessonsService) {}

  @Get()
  @RequirePermission('extra_lessons', PermissionAction.VIEW)
  findAll(@Query() query: QueryExtraLessonDto) {
    return this.extraLessonsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('extra_lessons', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.extraLessonsService.findOne(id);
  }

  @Post()
  @RequirePermission('extra_lessons', PermissionAction.CREATE)
  @Audited('ExtraLesson')
  create(@Body() dto: CreateExtraLessonDto, @CurrentUser() user: AuthenticatedUser) {
    return this.extraLessonsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('extra_lessons', PermissionAction.EDIT)
  @Audited('ExtraLesson')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExtraLessonDto) {
    return this.extraLessonsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('extra_lessons', PermissionAction.DELETE)
  @Audited('ExtraLesson', 'DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.extraLessonsService.remove(id);
  }
}
