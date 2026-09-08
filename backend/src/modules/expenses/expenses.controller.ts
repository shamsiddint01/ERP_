import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { QueryExpenseDto } from './dto/query-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { ExpensesService } from './expenses.service.js';

@ApiTags('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  @RequirePermission('expenses', PermissionAction.VIEW)
  findAll(@Query() query: QueryExpenseDto) {
    return this.expensesService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('expenses', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expensesService.findOne(id);
  }

  @Post()
  @RequirePermission('expenses', PermissionAction.CREATE)
  @Audited('Expense')
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expensesService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('expenses', PermissionAction.EDIT)
  @Audited('Expense')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseDto) {
    return this.expensesService.update(id, dto);
  }

  @Post(':id/submit')
  @RequirePermission('expenses', PermissionAction.EDIT)
  @Audited('Expense', 'SUBMIT')
  submit(@Param('id', ParseUUIDPipe) id: string) {
    return this.expensesService.submit(id);
  }

  @Post(':id/approve')
  @RequirePermission('expenses', PermissionAction.APPROVE)
  @Audited('Expense', 'APPROVE')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expensesService.approve(id, user.id);
  }

  @Post(':id/reject')
  @RequirePermission('expenses', PermissionAction.APPROVE)
  @Audited('Expense', 'REJECT')
  reject(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expensesService.reject(id, user.id);
  }

  @Post(':id/pay')
  @RequirePermission('expenses', PermissionAction.APPROVE)
  @Audited('Expense', 'PAY')
  pay(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expensesService.pay(id, user.id);
  }

  @Post(':id/cancel')
  @RequirePermission('expenses', PermissionAction.EDIT)
  @Audited('Expense', 'CANCEL')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expensesService.cancel(id, user.id);
  }
}
