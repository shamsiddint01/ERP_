import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto.js';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto.js';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto.js';
import { PurchasesService } from './purchases.service.js';

/** @deprecated Legacy retail module — retained for historical records and existing operations. Primary product is the education center. */
@ApiTags('purchases')
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @RequirePermission('purchases', PermissionAction.VIEW)
  findAll(@Query() query: QueryPurchaseOrderDto) {
    return this.purchasesService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('purchases', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchasesService.findOne(id);
  }

  @Post()
  @RequirePermission('purchases', PermissionAction.CREATE)
  @Audited('PurchaseOrder')
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.purchasesService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('purchases', PermissionAction.EDIT)
  @Audited('PurchaseOrder')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.purchasesService.update(id, dto);
  }

  @Post(':id/submit')
  @RequirePermission('purchases', PermissionAction.EDIT)
  @Audited('PurchaseOrder', 'SUBMIT')
  submit(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchasesService.submit(id);
  }

  @Post(':id/approve')
  @RequirePermission('purchases', PermissionAction.APPROVE)
  @Audited('PurchaseOrder', 'APPROVE')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.purchasesService.approve(id, user.id);
  }

  @Post(':id/receive')
  @RequirePermission('purchases', PermissionAction.APPROVE)
  @Audited('PurchaseOrder', 'RECEIVE')
  receive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceivePurchaseOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.purchasesService.receive(id, dto, user.id);
  }

  @Post(':id/cancel')
  @RequirePermission('purchases', PermissionAction.EDIT)
  @Audited('PurchaseOrder', 'CANCEL')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchasesService.cancel(id);
  }
}
