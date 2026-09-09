import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { QueryEmployeeDto } from './dto/query-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { EmployeesService } from './employees.service.js';

@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermission('employees', PermissionAction.VIEW)
  findAll(@Query() query: QueryEmployeeDto) {
    return this.employeesService.findAll(query);
  }

  @Get('overview')
  @RequirePermission('employees', PermissionAction.VIEW)
  getOverview() {
    return this.employeesService.getOverview();
  }

  @Get(':id')
  @RequirePermission('employees', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.findOne(id);
  }

  @Get(':id/activity')
  @RequirePermission('employees', PermissionAction.VIEW)
  getActivity(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.getActivity(id);
  }

  @Post()
  @RequirePermission('employees', PermissionAction.CREATE)
  @Audited('Employee')
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('employees', PermissionAction.EDIT)
  @Audited('Employee')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('employees', PermissionAction.DELETE)
  @Audited('Employee', 'TERMINATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.remove(id);
  }

  @Post(':id/reactivate')
  @RequirePermission('employees', PermissionAction.DELETE)
  @Audited('Employee', 'REACTIVATE')
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.reactivate(id);
  }
}
