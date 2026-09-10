import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { CompensationService } from './compensation.service.js';
import { CreateCompensationDto } from './dto/create-compensation.dto.js';
import { QueryCompensationDto } from './dto/query-compensation.dto.js';
import { UpdateCompensationDto } from './dto/update-compensation.dto.js';

@ApiTags('compensation')
@Controller('compensation')
export class CompensationController {
  constructor(private readonly compensationService: CompensationService) {}

  @Get()
  @RequirePermission('compensation', PermissionAction.VIEW)
  findAll(@Query() query: QueryCompensationDto) {
    return this.compensationService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('compensation', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.compensationService.findOne(id);
  }

  @Post()
  @RequirePermission('compensation', PermissionAction.CREATE)
  @Audited('EmployeeCompensation')
  create(@Body() dto: CreateCompensationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.compensationService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('compensation', PermissionAction.EDIT)
  @Audited('EmployeeCompensation')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompensationDto) {
    return this.compensationService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('compensation', PermissionAction.DELETE)
  @Audited('EmployeeCompensation', 'DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.compensationService.remove(id);
  }
}
