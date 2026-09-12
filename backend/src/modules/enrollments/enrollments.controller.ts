import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto.js';
import { QueryEnrollmentDto } from './dto/query-enrollment.dto.js';
import { TransferEnrollmentDto } from './dto/transfer-enrollment.dto.js';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto.js';
import { EnrollmentsService } from './enrollments.service.js';

@ApiTags('enrollments')
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Get()
  @RequirePermission('enrollments', PermissionAction.VIEW)
  findAll(@Query() query: QueryEnrollmentDto) {
    return this.enrollmentsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('enrollments', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollmentsService.findOne(id);
  }

  @Post()
  @RequirePermission('enrollments', PermissionAction.CREATE)
  @Audited('Enrollment')
  create(@Body() dto: CreateEnrollmentDto) {
    return this.enrollmentsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('enrollments', PermissionAction.EDIT)
  @Audited('Enrollment')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEnrollmentDto) {
    return this.enrollmentsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('enrollments', PermissionAction.DELETE)
  @Audited('Enrollment', 'CANCEL')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollmentsService.remove(id);
  }

  @Post(':id/activate')
  @RequirePermission('enrollments', PermissionAction.EDIT)
  @Audited('Enrollment', 'ACTIVATE')
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollmentsService.activate(id);
  }

  @Post(':id/pause')
  @RequirePermission('enrollments', PermissionAction.EDIT)
  @Audited('Enrollment', 'PAUSE')
  pause(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollmentsService.pause(id);
  }

  @Post(':id/complete')
  @RequirePermission('enrollments', PermissionAction.EDIT)
  @Audited('Enrollment', 'COMPLETE')
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollmentsService.complete(id);
  }

  @Post(':id/cancel')
  @RequirePermission('enrollments', PermissionAction.EDIT)
  @Audited('Enrollment', 'CANCEL')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollmentsService.cancel(id);
  }

  @Post(':id/transfer')
  @RequirePermission('enrollments', PermissionAction.EDIT)
  @Audited('Enrollment', 'TRANSFER')
  transfer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferEnrollmentDto) {
    return this.enrollmentsService.transfer(id, dto);
  }
}
