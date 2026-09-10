import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto.js';
import { QueryPayrollPeriodDto } from './dto/query-payroll-period.dto.js';
import { PayrollPeriodsService } from './payroll-periods.service.js';
import { PayrollService } from './payroll.service.js';

@ApiTags('payroll-periods')
@Controller('payroll-periods')
export class PayrollPeriodsController {
  constructor(
    private readonly periodsService: PayrollPeriodsService,
    private readonly payrollService: PayrollService,
  ) {}

  @Get()
  @RequirePermission('payroll', PermissionAction.VIEW)
  findAll(@Query() query: QueryPayrollPeriodDto) {
    return this.periodsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('payroll', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.periodsService.findOne(id);
  }

  @Get(':id/summary')
  @RequirePermission('payroll', PermissionAction.VIEW)
  getSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollService.getPeriodSummary(id);
  }

  @Post()
  @RequirePermission('payroll', PermissionAction.CREATE)
  @Audited('PayrollPeriod')
  create(@Body() dto: CreatePayrollPeriodDto) {
    return this.periodsService.create(dto);
  }

  @Post(':id/close')
  @RequirePermission('payroll', PermissionAction.APPROVE)
  @Audited('PayrollPeriod', 'CLOSE')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.periodsService.close(id);
  }

  @Post(':id/reopen')
  @RequirePermission('payroll', PermissionAction.APPROVE)
  @Audited('PayrollPeriod', 'REOPEN')
  reopen(@Param('id', ParseUUIDPipe) id: string) {
    return this.periodsService.reopen(id);
  }
}
