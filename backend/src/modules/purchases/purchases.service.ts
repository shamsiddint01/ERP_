import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { generateDocumentNumber } from '../../shared/utils/document-number.util.js';
import { computeLineItemTotals } from '../../shared/utils/line-item-totals.util.js';
import { InventoryService } from '../inventory/inventory.service.js';
import type { CreatePurchaseOrderDto, PurchaseOrderItemDto } from './dto/create-purchase-order.dto.js';
import type { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto.js';
import type { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto.js';
import type { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto.js';

const PO_INCLUDE = {
  supplier: { select: { id: true, companyName: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, fullName: true, username: true } },
  approvedBy: { select: { id: true, fullName: true, username: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
} satisfies Prisma.PurchaseOrderInclude;

function computeTotals(items: PurchaseOrderItemDto[]) {
  return computeLineItemTotals(items);
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('PurchaseOrder', (id) => this.prisma.purchaseOrder.findUnique({ where: { id } }));
  }

  async findAll(query: QueryPurchaseOrderDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PurchaseOrderWhereInput = {
      status: query.status,
      supplierId: query.supplierId,
      ...(query.search && { poNumber: { contains: query.search, mode: 'insensitive' } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: PO_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: PO_INCLUDE });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async create(dto: CreatePurchaseOrderDto, userId: string) {
    const totals = computeTotals(dto.items);
    const poNumber = await generateDocumentNumber('PO', () => this.prisma.purchaseOrder.count());

    return this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        orderDate: new Date(dto.orderDate),
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        notes: dto.notes,
        createdByUserId: userId,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        discountTotal: totals.discountTotal,
        grandTotal: totals.grandTotal,
        items: {
          create: totals.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxPercent: line.taxPercent,
            discountAmount: line.discountAmount,
            lineTotal: line.lineTotal,
          })),
        },
      },
      include: PO_INCLUDE,
    });
  }

  async update(id: string, dto: UpdatePurchaseOrderDto) {
    const po = await this.findOne(id);
    if (po.status !== 'DRAFT') throw new ConflictException('Only DRAFT purchase orders can be edited');

    const totals = dto.items ? computeTotals(dto.items) : null;

    return this.prisma.$transaction(async (tx) => {
      if (totals) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderItem.createMany({
          data: totals.lines.map((line) => ({
            purchaseOrderId: id,
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxPercent: line.taxPercent,
            discountAmount: line.discountAmount,
            lineTotal: line.lineTotal,
          })),
        });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId,
          orderDate: dto.orderDate ? new Date(dto.orderDate) : undefined,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
          notes: dto.notes,
          ...(totals && { subtotal: totals.subtotal, taxTotal: totals.taxTotal, discountTotal: totals.discountTotal, grandTotal: totals.grandTotal }),
        },
        include: PO_INCLUDE,
      });
    });
  }

  async submit(id: string) {
    const po = await this.findOne(id);
    if (po.status !== 'DRAFT') throw new ConflictException(`Only DRAFT orders can be submitted (current: ${po.status})`);
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'PENDING' }, include: PO_INCLUDE });
  }

  async approve(id: string, userId: string) {
    const po = await this.findOne(id);
    if (po.status !== 'PENDING') throw new ConflictException(`Only PENDING orders can be approved (current: ${po.status})`);
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'APPROVED', approvedByUserId: userId, approvedAt: new Date() },
      include: PO_INCLUDE,
    });
  }

  /** Receives goods: stock-in per line via InventoryService, apportions the supplier debt, and settles the PO's status. */
  async receive(id: string, dto: ReceivePurchaseOrderDto, userId: string) {
    const po = await this.findOne(id);
    if (po.status !== 'APPROVED' && po.status !== 'PARTIALLY_RECEIVED') {
      throw new ConflictException(`Only APPROVED or PARTIALLY_RECEIVED orders can receive stock (current: ${po.status})`);
    }

    const itemsById = new Map(po.items.map((item) => [item.id, item]));
    for (const receipt of dto.items) {
      const item = itemsById.get(receipt.purchaseOrderItemId);
      if (!item) throw new BadRequestException(`Item ${receipt.purchaseOrderItemId} does not belong to this purchase order`);
      const remaining = Number(item.quantity) - Number(item.quantityReceived);
      if (receipt.quantityReceived > remaining) {
        throw new BadRequestException(`Cannot receive ${receipt.quantityReceived} of "${item.product.name}" — only ${remaining} remaining`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let supplierDebtIncrease = 0;

      for (const receipt of dto.items) {
        const item = itemsById.get(receipt.purchaseOrderItemId)!;
        const perUnitValue = Number(item.lineTotal) / Number(item.quantity);
        supplierDebtIncrease += perUnitValue * receipt.quantityReceived;

        await this.inventoryService.adjustStock(
          {
            productId: item.productId,
            warehouseId: po.warehouseId,
            movementType: 'STOCK_IN',
            quantity: receipt.quantityReceived,
            referenceType: 'PURCHASE',
            referenceId: po.id,
            unitCost: Number(item.unitPrice),
            performedByUserId: userId,
          },
          tx,
        );

        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { quantityReceived: { increment: receipt.quantityReceived } },
        });
      }

      await tx.supplier.update({ where: { id: po.supplierId }, data: { balance: { increment: supplierDebtIncrease } } });

      const refreshedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
      const fullyReceived = refreshedItems.every((item) => Number(item.quantityReceived) >= Number(item.quantity));

      return tx.purchaseOrder.update({
        where: { id },
        data: fullyReceived
          ? { status: 'RECEIVED', receivedAt: new Date() }
          : { status: 'PARTIALLY_RECEIVED' },
        include: PO_INCLUDE,
      });
    });
  }

  async cancel(id: string) {
    const po = await this.findOne(id);
    if (!['DRAFT', 'PENDING', 'APPROVED'].includes(po.status)) {
      throw new ConflictException(`Cannot cancel a purchase order once receiving has started (current: ${po.status})`);
    }
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' }, include: PO_INCLUDE });
  }
}
