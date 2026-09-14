import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { QueryOrderDto } from './dto/query-order.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { OrdersService } from './orders.service.js';

/** @deprecated Legacy retail module — retained for historical records and existing operations. Primary product is the education center. */
@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermission('orders', PermissionAction.VIEW)
  findAll(@Query() query: QueryOrderDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('orders', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id);
  }

  @Post()
  @RequirePermission('orders', PermissionAction.CREATE)
  @Audited('Order')
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('orders', PermissionAction.EDIT)
  @Audited('Order')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderDto) {
    return this.ordersService.update(id, dto);
  }

  @Post(':id/confirm')
  @RequirePermission('orders', PermissionAction.EDIT)
  @Audited('Order', 'CONFIRM')
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.confirm(id);
  }

  @Post(':id/process')
  @RequirePermission('orders', PermissionAction.EDIT)
  @Audited('Order', 'PROCESS')
  process(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.process(id);
  }

  @Post(':id/complete')
  @RequirePermission('orders', PermissionAction.APPROVE)
  @Audited('Order', 'COMPLETE')
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.complete(id, user.id);
  }

  @Post(':id/cancel')
  @RequirePermission('orders', PermissionAction.EDIT)
  @Audited('Order', 'CANCEL')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto) {
    return this.ordersService.cancel(id, dto);
  }
}
