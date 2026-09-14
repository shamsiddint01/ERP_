import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { AssessmentsService } from './assessments.service.js';
import { UpdateAssessmentDto } from './dto/update-assessment.dto.js';

@ApiTags('assessments')
@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Patch(':id')
  @RequirePermission('grades', PermissionAction.EDIT)
  @Audited('Assessment')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssessmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assessmentsService.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('grades', PermissionAction.DELETE)
  @Audited('Assessment', 'DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assessmentsService.remove(id, user.id);
  }
}
