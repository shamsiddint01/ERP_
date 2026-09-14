import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { QueryCustomerDto } from './dto/query-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';

/** @deprecated Legacy retail module — retained for historical records and existing operations. Primary product is the education center (Student/Guardian). */
@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermission('customers', PermissionAction.VIEW)
  findAll(@Query() query: QueryCustomerDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('customers', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.findOne(id);
  }

  @Get(':id/history')
  @RequirePermission('customers', PermissionAction.VIEW)
  getHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.getHistory(id);
  }

  @Post()
  @RequirePermission('customers', PermissionAction.CREATE)
  @Audited('Customer')
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('customers', PermissionAction.EDIT)
  @Audited('Customer')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('customers', PermissionAction.DELETE)
  @Audited('Customer', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.remove(id);
  }
}
