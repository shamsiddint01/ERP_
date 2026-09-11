import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { ChangeLeadStatusDto } from './dto/change-lead-status.dto.js';
import { ConvertLeadDto } from './dto/convert-lead.dto.js';
import { CreateLeadActivityDto } from './dto/create-lead-activity.dto.js';
import { CreateLeadDto } from './dto/create-lead.dto.js';
import { QueryLeadDto } from './dto/query-lead.dto.js';
import { UpdateLeadDto } from './dto/update-lead.dto.js';
import { LeadsService } from './leads.service.js';

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @RequirePermission('leads', PermissionAction.VIEW)
  findAll(@Query() query: QueryLeadDto) {
    return this.leadsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('leads', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadsService.findOne(id);
  }

  @Post()
  @RequirePermission('leads', PermissionAction.CREATE)
  @Audited('Lead')
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('leads', PermissionAction.EDIT)
  @Audited('Lead')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeadDto) {
    return this.leadsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('leads', PermissionAction.DELETE)
  @Audited('Lead')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadsService.remove(id);
  }

  @Get(':id/activities')
  @RequirePermission('leads', PermissionAction.VIEW)
  listActivities(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadsService.listActivities(id);
  }

  @Post(':id/activities')
  @RequirePermission('leads', PermissionAction.EDIT)
  @Audited('Lead', 'ACTIVITY_ADD')
  addActivity(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLeadActivityDto, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.addActivity(id, dto, user.id);
  }

  @Delete(':id/activities/:activityId')
  @RequirePermission('leads', PermissionAction.EDIT)
  @Audited('Lead', 'ACTIVITY_REMOVE')
  removeActivity(@Param('id', ParseUUIDPipe) id: string, @Param('activityId', ParseUUIDPipe) activityId: string) {
    return this.leadsService.removeActivity(id, activityId);
  }

  @Patch(':id/status')
  @RequirePermission('leads', PermissionAction.EDIT)
  @Audited('Lead', 'STATUS_CHANGE')
  changeStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeLeadStatusDto) {
    return this.leadsService.changeStatus(id, dto);
  }

  @Post(':id/convert')
  @RequirePermission('leads', PermissionAction.EDIT)
  @Audited('Lead', 'CONVERT')
  convert(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConvertLeadDto) {
    return this.leadsService.convert(id, dto);
  }
}
