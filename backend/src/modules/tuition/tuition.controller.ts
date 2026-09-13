import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { CreateTuitionChargeDto } from './dto/create-tuition-charge.dto.js';
import { QueryTuitionChargeDto } from './dto/query-tuition-charge.dto.js';
import { UpdateTuitionChargeDto } from './dto/update-tuition-charge.dto.js';
import { TuitionChargeService } from './tuition-charge.service.js';

@ApiTags('tuition')
@Controller('tuition')
export class TuitionController {
  constructor(private readonly tuitionChargeService: TuitionChargeService) {}

  @Get()
  @RequirePermission('tuition', PermissionAction.VIEW)
  findAll(@Query() query: QueryTuitionChargeDto) {
    return this.tuitionChargeService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('tuition', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tuitionChargeService.findOne(id);
  }

  @Post()
  @RequirePermission('tuition', PermissionAction.CREATE)
  @Audited('TuitionCharge')
  create(@Body() dto: CreateTuitionChargeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tuitionChargeService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('tuition', PermissionAction.EDIT)
  @Audited('TuitionCharge')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTuitionChargeDto) {
    return this.tuitionChargeService.update(id, dto);
  }

  @Post(':id/cancel')
  @RequirePermission('tuition', PermissionAction.APPROVE)
  @Audited('TuitionCharge', 'CANCEL')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tuitionChargeService.cancel(id, user.id);
  }
}
