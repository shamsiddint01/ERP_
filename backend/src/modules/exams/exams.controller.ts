import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { AssessmentsService } from './assessments.service.js';
import { CreateAssessmentDto } from './dto/create-assessment.dto.js';
import { CreateExamDto } from './dto/create-exam.dto.js';
import { QueryExamDto } from './dto/query-exam.dto.js';
import { UpdateExamDto } from './dto/update-exam.dto.js';
import { ExamsService } from './exams.service.js';

@ApiTags('exams')
@Controller('exams')
export class ExamsController {
  constructor(
    private readonly examsService: ExamsService,
    private readonly assessmentsService: AssessmentsService,
  ) {}

  @Get()
  @RequirePermission('exams', PermissionAction.VIEW)
  findAll(@Query() query: QueryExamDto, @CurrentUser() user: AuthenticatedUser) {
    return this.examsService.findAll(query, user.id);
  }

  @Get(':id')
  @RequirePermission('exams', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.examsService.findOne(id, user.id);
  }

  @Post()
  @RequirePermission('exams', PermissionAction.CREATE)
  @Audited('Exam')
  create(@Body() dto: CreateExamDto, @CurrentUser() user: AuthenticatedUser) {
    return this.examsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('exams', PermissionAction.EDIT)
  @Audited('Exam')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExamDto, @CurrentUser() user: AuthenticatedUser) {
    return this.examsService.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('exams', PermissionAction.DELETE)
  @Audited('Exam', 'DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.examsService.remove(id, user.id);
  }

  @Get(':id/assessments')
  @RequirePermission('grades', PermissionAction.VIEW)
  findAssessments(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assessmentsService.findAllForExam(id, user.id);
  }

  @Post(':id/assessments')
  @RequirePermission('grades', PermissionAction.CREATE)
  @Audited('Assessment')
  createAssessment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateAssessmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assessmentsService.create(id, dto, user.id);
  }
}
