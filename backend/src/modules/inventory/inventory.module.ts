import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';
import { WarehousesController } from './warehouses.controller.js';
import { WarehousesService } from './warehouses.service.js';

@Module({
  controllers: [InventoryController, WarehousesController, TransfersController],
  providers: [InventoryService, WarehousesService, TransfersService],
  exports: [InventoryService, WarehousesService],
})
export class InventoryModule {}
