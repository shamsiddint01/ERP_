import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { CreateTransferDto } from './dto/create-transfer.dto.js';
import { QueryTransfersDto } from './dto/query-transfers.dto.js';
import { TransfersService } from './transfers.service.js';

/** @deprecated Legacy retail module — retained for historical records and existing operations. Primary product is the education center. */
@ApiTags('inventory')
@Controller('inventory/transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get()
  @RequirePermission('inventory', PermissionAction.VIEW)
  findAll(@Query() query: QueryTransfersDto) {
    return this.transfersService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('inventory', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.transfersService.findOne(id);
  }

  @Post()
  @RequirePermission('inventory', PermissionAction.CREATE)
  @Audited('StockTransfer')
  create(@Body() dto: CreateTransferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.transfersService.create(dto, user.id);
  }

  @Post(':id/complete')
  @RequirePermission('inventory', PermissionAction.APPROVE)
  @Audited('StockTransfer', 'COMPLETE')
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.transfersService.complete(id);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory', PermissionAction.EDIT)
  @Audited('StockTransfer', 'CANCEL')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.transfersService.cancel(id);
  }
}
