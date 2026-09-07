import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { FinanceLedgerService } from '../../shared/finance/finance-ledger.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { computeLineItemTotals } from '../../shared/utils/line-item-totals.util.js';
import { generateDocumentNumber } from '../../shared/utils/document-number.util.js';
import { computePaymentStatus } from '../../shared/utils/payment-status.util.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import type { CancelOrderDto } from './dto/cancel-order.dto.js';
import type { CreateOrderDto, OrderItemDto } from './dto/create-order.dto.js';
import type { QueryOrderDto } from './dto/query-order.dto.js';
import type { UpdateOrderDto } from './dto/update-order.dto.js';

const ORDER_INCLUDE = {
  customer: { select: { id: true, name: true, companyName: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  responsibleEmployee: { select: { id: true, fullName: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
  invoices: { select: { id: true, invoiceNumber: true, status: true, grandTotal: true, amountPaid: true } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly financeLedger: FinanceLedgerService,
    private readonly invoicesService: InvoicesService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Order', (id) => this.prisma.order.findUnique({ where: { id } }));
  }

  async findAll(query: QueryOrderDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.OrderWhereInput = {
      status: query.status,
      paymentStatus: query.paymentStatus,
      customerId: query.customerId,
      ...(query.search && { orderNumber: { contains: query.search, mode: 'insensitive' } }),
      ...((query.from || query.to) && {
        orderDate: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async create(dto: CreateOrderDto) {
    await this.assertCustomerActive(dto.customerId);
    await this.assertProductsActive(dto.items);

    const totals = computeLineItemTotals(dto.items);
    const orderNumber = await generateDocumentNumber('ORD', () => this.prisma.order.count());

    return this.prisma.order.create({
      data: {
        orderNumber,
        customerId: dto.customerId,
        warehouseId: dto.warehouseId,
        orderDate: new Date(dto.orderDate),
        responsibleEmployeeId: dto.responsibleEmployeeId,
        notes: dto.notes,
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
      include: ORDER_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateOrderDto) {
    const order = await this.findOne(id);
    if (order.status !== 'DRAFT') throw new ConflictException('Only DRAFT orders can be edited');

    if (dto.customerId) await this.assertCustomerActive(dto.customerId);
    if (dto.items) await this.assertProductsActive(dto.items);

    const totals = dto.items ? computeLineItemTotals(dto.items) : null;

    return this.prisma.$transaction(async (tx) => {
      if (totals) {
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.orderItem.createMany({
          data: totals.lines.map((line) => ({
            orderId: id,
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxPercent: line.taxPercent,
            discountAmount: line.discountAmount,
            lineTotal: line.lineTotal,
          })),
        });
      }

      return tx.order.update({
        where: { id },
        data: {
          customerId: dto.customerId,
          warehouseId: dto.warehouseId,
          orderDate: dto.orderDate ? new Date(dto.orderDate) : undefined,
          responsibleEmployeeId: dto.responsibleEmployeeId,
          notes: dto.notes,
          ...(totals && { subtotal: totals.subtotal, taxTotal: totals.taxTotal, discountTotal: totals.discountTotal, grandTotal: totals.grandTotal }),
        },
        include: ORDER_INCLUDE,
      });
    });
  }

  /** DRAFT -> CONFIRMED: carves out ("reserves") the stock this order needs without physically moving it yet. */
  async confirm(id: string) {
    const order = await this.findOne(id);
    if (order.status !== 'DRAFT') throw new ConflictException(`Only DRAFT orders can be confirmed (current: ${order.status})`);

    return this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await this.inventoryService.reserveStock(
          { productId: item.productId, warehouseId: order.warehouseId, quantity: Number(item.quantity) },
          tx,
        );
      }
      return tx.order.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date() }, include: ORDER_INCLUDE });
    });
  }

  /** CONFIRMED -> PROCESSING: a pure workflow signal for fulfillment staff, no stock/financial impact. */
  async process(id: string) {
    const order = await this.findOne(id);
    if (order.status !== 'CONFIRMED') throw new ConflictException(`Only CONFIRMED orders can move to PROCESSING (current: ${order.status})`);
    return this.prisma.order.update({ where: { id }, data: { status: 'PROCESSING' }, include: ORDER_INCLUDE });
  }

  /**
   * PROCESSING -> COMPLETED: the cascade the whole architecture was built for —
   * fulfills the stock reservation, posts revenue to the ledger, updates the
   * customer's balance, and auto-issues an invoice, all inside one transaction.
   */
  async complete(id: string, userId: string) {
    const order = await this.findOne(id);
    if (order.status !== 'PROCESSING') throw new ConflictException(`Only PROCESSING orders can be completed (current: ${order.status})`);

    return this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await this.inventoryService.fulfillReservedStock(
          {
            productId: item.productId,
            warehouseId: order.warehouseId,
            quantity: Number(item.quantity),
            referenceType: 'SALE',
            referenceId: order.id,
            performedByUserId: userId,
          },
          tx,
        );
      }

      await this.financeLedger.recordTransaction(
        {
          type: 'SALE_REVENUE',
          amount: Number(order.grandTotal),
          referenceType: 'ORDER',
          referenceId: order.id,
          description: `Sale revenue for order ${order.orderNumber}`,
          createdByUserId: userId,
        },
        tx,
      );

      await tx.customer.update({
        where: { id: order.customerId },
        data: { balance: { increment: Number(order.grandTotal) - Number(order.amountPaid) } },
      });

      const completedOrder = await tx.order.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
        include: ORDER_INCLUDE,
      });

      const invoice = await this.invoicesService.createFromOrder(completedOrder, tx);

      // Auto-created inside this transaction (not via its own HTTP request), so
      // AuditInterceptor never sees it — write the "Invoice created" entry directly.
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: 'CREATE',
          entityType: 'Invoice',
          entityId: invoice.id,
          newValue: { invoiceNumber: invoice.invoiceNumber, orderId: order.id, grandTotal: invoice.grandTotal.toString() },
          description: `${invoice.invoiceNumber} auto-issued from completed order ${order.orderNumber}`,
        },
      });

      return tx.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    });
  }

  /** Cancellable up through PROCESSING (releasing any reservation); a COMPLETED sale needs a return workflow, not a cancel. */
  async cancel(id: string, dto: CancelOrderDto) {
    const order = await this.findOne(id);
    if (!['DRAFT', 'CONFIRMED', 'PROCESSING'].includes(order.status)) {
      throw new ConflictException(`Cannot cancel an order once it is completed (current: ${order.status})`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (order.status === 'CONFIRMED' || order.status === 'PROCESSING') {
        for (const item of order.items) {
          await this.inventoryService.releaseReservedStock(
            { productId: item.productId, warehouseId: order.warehouseId, quantity: Number(item.quantity) },
            tx,
          );
        }
      }
      return tx.order.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: dto.reason },
        include: ORDER_INCLUDE,
      });
    });
  }

  /** Shared by PaymentsService: applies a completed payment's amount to an order and reconciles its payment status. */
  async applyPayment(orderId: string, amount: number, tx: Prisma.TransactionClient) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === 'CANCELLED') throw new BadRequestException('Cannot record a payment against a cancelled order');
    const remaining = Number(order.grandTotal) - Number(order.amountPaid);
    if (amount > remaining) {
      throw new BadRequestException(`Payment amount ${amount} exceeds the remaining balance ${remaining}`);
    }
    const newAmountPaid = Number(order.amountPaid) + amount;
    return tx.order.update({
      where: { id: orderId },
      data: { amountPaid: newAmountPaid, paymentStatus: computePaymentStatus(newAmountPaid, Number(order.grandTotal)) },
    });
  }

  /** Shared by PaymentsService.refund(): reverses a previously-applied payment amount. */
  async reversePayment(orderId: string, amount: number, tx: Prisma.TransactionClient) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const newAmountPaid = Math.max(0, Number(order.amountPaid) - amount);
    return tx.order.update({
      where: { id: orderId },
      data: { amountPaid: newAmountPaid, paymentStatus: computePaymentStatus(newAmountPaid, Number(order.grandTotal)) },
    });
  }

  private async assertCustomerActive(customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.deletedAt) throw new NotFoundException('Customer not found');
    if (customer.status !== 'ACTIVE') throw new BadRequestException('Cannot create an order for an inactive customer');
  }

  private async assertProductsActive(items: OrderItemDto[]): Promise<void> {
    const products = await this.prisma.product.findMany({ where: { id: { in: items.map((i) => i.productId) } } });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const item of items) {
      const product = byId.get(item.productId);
      if (!product || product.deletedAt) throw new NotFoundException(`Product ${item.productId} not found`);
      if (product.status !== 'ACTIVE') throw new BadRequestException(`Product "${product.name}" is not active`);
    }
  }
}
