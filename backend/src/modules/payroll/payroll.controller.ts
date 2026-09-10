import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { toCsv } from '../reports/report-export.util.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { AddPayrollLineDto } from './dto/add-payroll-line.dto.js';
import { CancelPayrollDto } from './dto/cancel-payroll.dto.js';
import { CreatePayrollDto } from './dto/create-payroll.dto.js';
import { GeneratePayrollDto } from './dto/generate-payroll.dto.js';
import { PayPayrollDto } from './dto/pay-payroll.dto.js';
import { QueryPayrollDto } from './dto/query-payroll.dto.js';
import { PayrollReportsService } from './payroll-reports.service.js';
import { PayrollService } from './payroll.service.js';

type PayrollReportType = 'summary' | 'by-employee' | 'by-department' | 'overtime' | 'allowances' | 'deductions' | 'bonuses' | 'payment-status' | 'expense';

@ApiTags('payroll')
@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly payrollService: PayrollService,
    private readonly reportsService: PayrollReportsService,
  ) {}

  @Get()
  @RequirePermission('payroll', PermissionAction.VIEW)
  findAll(@Query() query: QueryPayrollDto) {
    return this.payrollService.findAll(query);
  }

  @Get('reports')
  @RequirePermission('payroll', PermissionAction.VIEW)
  async getReport(
    @Query('type') type: PayrollReportType,
    @Query('periodId') periodId: string | undefined,
    @Query('departmentId') departmentId: string | undefined,
    @Query('employeeId') employeeId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const filters = { periodId, departmentId, employeeId, status };
    const report = await this.resolveReport(type, filters);

    if (format === 'csv' && Array.isArray(report)) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="payroll-${type}.csv"`);
      return res.send(toCsv(report));
    }
    return res.json(report);
  }

  private resolveReport(type: PayrollReportType, filters: { periodId?: string; departmentId?: string; employeeId?: string; status?: string }) {
    switch (type) {
      case 'by-employee':
        return this.reportsService.getByEmployee(filters);
      case 'by-department':
        return this.reportsService.getByDepartment(filters);
      case 'overtime':
        return this.reportsService.getOvertimeReport(filters);
      case 'allowances':
        return this.reportsService.getComponentReport(filters, 'ALLOWANCE');
      case 'deductions':
        return this.reportsService.getComponentReport(filters, 'DEDUCTION');
      case 'bonuses':
        return this.reportsService.getComponentReport(filters, 'BONUS');
      case 'summary':
      case 'payment-status':
      case 'expense':
      default:
        return this.reportsService.getSummary(filters);
    }
  }

  @Get(':id')
  @RequirePermission('payroll', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollService.findOne(id);
  }

  @Post()
  @RequirePermission('payroll', PermissionAction.CREATE)
  @Audited('Payroll')
  create(@Body() dto: CreatePayrollDto, @CurrentUser() user: AuthenticatedUser) {
    return this.payrollService.create(dto.periodId, dto.employeeId, user.id);
  }

  @Post('generate')
  @RequirePermission('payroll', PermissionAction.CREATE)
  @Audited('Payroll', 'GENERATE')
  generate(@Body() dto: GeneratePayrollDto, @CurrentUser() user: AuthenticatedUser) {
    return this.payrollService.generate(dto, user.id);
  }

  @Post(':id/lines')
  @RequirePermission('payroll', PermissionAction.EDIT)
  @Audited('Payroll', 'ADD_LINE')
  addLine(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddPayrollLineDto) {
    return this.payrollService.addLine(id, dto);
  }

  @Delete(':id/lines/:lineId')
  @RequirePermission('payroll', PermissionAction.EDIT)
  @Audited('Payroll', 'REMOVE_LINE')
  removeLine(@Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string) {
    return this.payrollService.removeLine(id, lineId);
  }

  @Post(':id/calculate')
  @RequirePermission('payroll', PermissionAction.EDIT)
  @Audited('Payroll', 'CALCULATE')
  calculate(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollService.calculate(id);
  }

  @Post(':id/approve')
  @RequirePermission('payroll', PermissionAction.APPROVE)
  @Audited('Payroll', 'APPROVE')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payrollService.approve(id, user.id);
  }

  @Post(':id/pay')
  @RequirePermission('payroll', PermissionAction.APPROVE)
  @Audited('Payroll', 'PAY')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayPayrollDto, @CurrentUser() user: AuthenticatedUser) {
    return this.payrollService.pay(id, dto, user.id);
  }

  @Post(':id/cancel')
  @RequirePermission('payroll', PermissionAction.APPROVE)
  @Audited('Payroll', 'CANCEL')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelPayrollDto, @CurrentUser() user: AuthenticatedUser) {
    return this.payrollService.cancel(id, dto, user.id);
  }
}
