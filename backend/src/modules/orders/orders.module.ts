import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [InventoryModule, InvoicesModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
