import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async getOverview() {
    const [customersCount, productsCount, suppliersCount, pendingPurchaseOrdersCount, inventorySummary] = await Promise.all([
      this.prisma.customer.count({ where: { deletedAt: null } }),
      this.prisma.product.count({ where: { deletedAt: null } }),
      this.prisma.supplier.count({ where: { deletedAt: null } }),
      this.prisma.purchaseOrder.count({ where: { status: { in: ['PENDING', 'APPROVED'] } } }),
      this.inventoryService.getSummary(),
    ]);

    return {
      customersCount,
      productsCount,
      suppliersCount,
      pendingPurchaseOrdersCount,
      totalStockQuantity: inventorySummary.totalStockQuantity,
      lowStockCount: inventorySummary.lowStockCount,
      outOfStockCount: inventorySummary.outOfStockCount,
      recentMovements: inventorySummary.recentMovements,
    };
  }
}
