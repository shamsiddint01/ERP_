import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreatePayrollComponentDto } from './dto/create-payroll-component.dto.js';
import { UpdatePayrollComponentDto } from './dto/update-payroll-component.dto.js';
import { PayrollComponentsService } from './payroll-components.service.js';

@ApiTags('payroll-components')
@Controller('payroll-components')
export class PayrollComponentsController {
  constructor(private readonly componentsService: PayrollComponentsService) {}

  @Get()
  @RequirePermission('payroll', PermissionAction.VIEW)
  findAll() {
    return this.componentsService.findAll();
  }

  @Get(':id')
  @RequirePermission('payroll', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.componentsService.findOne(id);
  }

  @Post()
  @RequirePermission('payroll', PermissionAction.CREATE)
  @Audited('PayrollComponent')
  create(@Body() dto: CreatePayrollComponentDto) {
    return this.componentsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('payroll', PermissionAction.EDIT)
  @Audited('PayrollComponent')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePayrollComponentDto) {
    return this.componentsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('payroll', PermissionAction.DELETE)
  @Audited('PayrollComponent', 'DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.componentsService.remove(id);
  }
}
