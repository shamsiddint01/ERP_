import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { DamageStockDto } from './dto/damage-stock.dto.js';
import { QueryMovementsDto } from './dto/query-movements.dto.js';
import { QueryStockDto } from './dto/query-stock.dto.js';
import { StockInDto } from './dto/stock-in.dto.js';
import { StockOutDto } from './dto/stock-out.dto.js';
import { InventoryService } from './inventory.service.js';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermission('inventory', PermissionAction.VIEW)
  listStock(@Query() query: QueryStockDto) {
    return this.inventoryService.listStock(query);
  }

  @Get('movements')
  @RequirePermission('inventory', PermissionAction.VIEW)
  listMovements(@Query() query: QueryMovementsDto) {
    return this.inventoryService.listMovements(query);
  }

  @Get('summary')
  @RequirePermission('inventory', PermissionAction.VIEW)
  getSummary() {
    return this.inventoryService.getSummary();
  }

  @Post('stock-in')
  @RequirePermission('inventory', PermissionAction.CREATE)
  @Audited('StockMovement', 'STOCK_IN')
  stockIn(@Body() dto: StockInDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.stockIn(dto, user.id);
  }

  @Post('stock-out')
  @RequirePermission('inventory', PermissionAction.CREATE)
  @Audited('StockMovement', 'STOCK_OUT')
  stockOut(@Body() dto: StockOutDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.stockOut(dto, user.id);
  }

  @Post('adjust')
  @RequirePermission('inventory', PermissionAction.EDIT)
  @Audited('StockMovement', 'ADJUST')
  adjust(@Body() dto: AdjustStockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.adjust(dto, user.id);
  }

  @Post('damage')
  @RequirePermission('inventory', PermissionAction.EDIT)
  @Audited('StockMovement', 'DAMAGE')
  damage(@Body() dto: DamageStockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.damage(dto, user.id);
  }
}
