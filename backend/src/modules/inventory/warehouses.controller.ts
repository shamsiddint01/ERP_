import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto.js';
import { WarehousesService } from './warehouses.service.js';

/** @deprecated Legacy retail module — retained for historical records and existing operations. Primary product is the education center (Branch is the education-center equivalent). */
@ApiTags('warehouses')
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @RequirePermission('inventory', PermissionAction.VIEW)
  findAll() {
    return this.warehousesService.findAll();
  }

  @Get(':id')
  @RequirePermission('inventory', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehousesService.findOne(id);
  }

  @Post()
  @RequirePermission('inventory', PermissionAction.CREATE)
  @Audited('Warehouse')
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('inventory', PermissionAction.EDIT)
  @Audited('Warehouse')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('inventory', PermissionAction.EDIT)
  @Audited('Warehouse', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehousesService.remove(id);
  }
}
