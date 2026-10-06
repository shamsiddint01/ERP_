import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { CreateHomeworkDto } from './dto/create-homework.dto.js';
import { GradeSubmissionDto } from './dto/grade-submission.dto.js';
import { QueryHomeworkDto } from './dto/query-homework.dto.js';
import { UpdateHomeworkDto } from './dto/update-homework.dto.js';
import { HomeworkService } from './homework.service.js';

@ApiTags('homework')
@Controller('homework')
export class HomeworkController {
  constructor(private readonly homeworkService: HomeworkService) {}

  @Get()
  @RequirePermission('homework', PermissionAction.VIEW)
  findAll(@Query() query: QueryHomeworkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.findAll(query, user.id);
  }

  @Post()
  @RequirePermission('homework', PermissionAction.CREATE)
  @Audited('Homework')
  create(@Body() dto: CreateHomeworkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.create(dto, user.id);
  }

  @Patch('submissions/:submissionId/grade')
  @RequirePermission('homework', PermissionAction.EDIT)
  @Audited('HomeworkSubmission', 'GRADE')
  grade(@Param('submissionId', ParseUUIDPipe) submissionId: string, @Body() dto: GradeSubmissionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.gradeSubmission(submissionId, dto, user.id);
  }

  @Get(':id/submissions')
  @RequirePermission('homework', PermissionAction.VIEW)
  findSubmissions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.findSubmissions(id, user.id);
  }

  @Patch(':id')
  @RequirePermission('homework', PermissionAction.EDIT)
  @Audited('Homework')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHomeworkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('homework', PermissionAction.DELETE)
  @Audited('Homework', 'DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.remove(id, user.id);
  }
}
