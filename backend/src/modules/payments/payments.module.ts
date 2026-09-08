import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PurchasesModule } from '../purchases/purchases.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [OrdersModule, InvoicesModule, PurchasesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
