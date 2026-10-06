import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { SubmitHomeworkDto } from './dto/submit-homework.dto.js';
import { PortalService } from './portal.service.js';

/**
 * The student's own portal. Every route needs `student_portal:VIEW` AND a
 * Student record linked to the caller (PortalService.resolveStudent) — there
 * is no studentId in any URL, so a student can only ever reach their own data.
 */
@ApiTags('portal')
@Controller('portal')
@RequirePermission('student_portal', PermissionAction.VIEW)
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.portalService.getOverview(user.id);
  }

  @Get('homework')
  homework(@CurrentUser() user: AuthenticatedUser) {
    return this.portalService.getHomework(user.id);
  }

  @Put('homework/:id/submission')
  submitHomework(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitHomeworkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.portalService.submitHomework(user.id, id, dto);
  }

  @Get('groups')
  groups(@CurrentUser() user: AuthenticatedUser) {
    return this.portalService.getGroups(user.id);
  }

  @Get('payments')
  payments(@CurrentUser() user: AuthenticatedUser) {
    return this.portalService.getPayments(user.id);
  }

  @Get('exams')
  exams(@CurrentUser() user: AuthenticatedUser) {
    return this.portalService.getExams(user.id);
  }

  @Get('progress')
  progress(@CurrentUser() user: AuthenticatedUser) {
    return this.portalService.getProgress(user.id);
  }

  @Get('extra-lessons')
  extraLessons(@CurrentUser() user: AuthenticatedUser) {
    return this.portalService.getExtraLessons(user.id);
  }

  @Post('extra-lessons/:id/registration')
  register(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.portalService.registerExtraLesson(user.id, id);
  }

  @Delete('extra-lessons/:id/registration')
  cancelRegistration(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.portalService.cancelExtraLessonRegistration(user.id, id);
  }
}
