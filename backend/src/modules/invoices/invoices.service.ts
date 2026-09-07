import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { InvoiceStatus, Order, OrderItem, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { generateDocumentNumber } from '../../shared/utils/document-number.util.js';
import { computeLineItemTotals } from '../../shared/utils/line-item-totals.util.js';
import type { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import type { QueryInvoiceDto } from './dto/query-invoice.dto.js';
import type { UpdateInvoiceDto } from './dto/update-invoice.dto.js';
import { InvoicePdfService } from './invoice-pdf.service.js';

type TransactionClient = Prisma.TransactionClient;

/**
 * Invoice.status has no UNPAID member (unlike Order.paymentStatus) — an
 * unpaid invoice is simply SENT (or OVERDUE, via the lazy check). So payment
 * reconciliation needs its own resolver rather than the generic
 * computePaymentStatus used for Order.paymentStatus.
 */
function resolveInvoiceStatus(amountPaid: number, grandTotal: number, currentStatus: InvoiceStatus): InvoiceStatus {
  if (amountPaid <= 0) {
    return currentStatus === 'PAID' || currentStatus === 'PARTIALLY_PAID' || currentStatus === 'OVERDUE' ? 'SENT' : currentStatus;
  }
  return amountPaid < grandTotal ? 'PARTIALLY_PAID' : 'PAID';
}

const INVOICE_INCLUDE = {
  customer: true,
  order: { select: { id: true, orderNumber: true, status: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
} satisfies Prisma.InvoiceInclude;

const DEFAULT_DUE_DAYS = 14;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: InvoicePdfService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Invoice', (id) => this.prisma.invoice.findUnique({ where: { id } }));
  }

  async findAll(query: QueryInvoiceDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.InvoiceWhereInput = {
      status: query.status,
      customerId: query.customerId,
      ...(query.search && { invoiceNumber: { contains: query.search, mode: 'insensitive' } }),
      ...((query.from || query.to) && {
        issueDate: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
      }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: INVOICE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    const items = await Promise.all(rows.map((invoice) => this.applyOverdueCheck(invoice)));
    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.applyOverdueCheck(invoice);
  }

  async create(dto: CreateInvoiceDto) {
    const totals = computeLineItemTotals(dto.items);
    const invoiceNumber = await generateDocumentNumber('INV', () => this.prisma.invoice.count());

    return this.prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId: dto.customerId,
        orderId: dto.orderId,
        status: 'DRAFT',
        issueDate: new Date(dto.issueDate),
        dueDate: new Date(dto.dueDate),
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        discountTotal: totals.discountTotal,
        grandTotal: totals.grandTotal,
        items: {
          create: totals.lines.map((line) => ({
            productId: line.productId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxPercent: line.taxPercent,
            discountAmount: line.discountAmount,
            lineTotal: line.lineTotal,
          })),
        },
      },
      include: INVOICE_INCLUDE,
    });
  }

  /** Auto-issues an invoice straight from a just-completed Order — see OrdersService.complete(). */
  async createFromOrder(order: Order & { items: (OrderItem & { product: { name: string } })[] }, tx: TransactionClient) {
    const invoiceNumber = await generateDocumentNumber('INV', () => tx.invoice.count());
    const issueDate = new Date();
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + DEFAULT_DUE_DAYS);

    return tx.invoice.create({
      data: {
        invoiceNumber,
        customerId: order.customerId,
        orderId: order.id,
        status: 'SENT',
        issueDate,
        dueDate,
        subtotal: order.subtotal,
        taxTotal: order.taxTotal,
        discountTotal: order.discountTotal,
        grandTotal: order.grandTotal,
        items: {
          create: order.items.map((item) => ({
            productId: item.productId,
            description: item.product.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxPercent: item.taxPercent,
            discountAmount: item.discountAmount,
            lineTotal: item.lineTotal,
          })),
        },
      },
    });
  }

  async update(id: string, dto: UpdateInvoiceDto) {
    const invoice = await this.findOne(id);
    if (invoice.status !== 'DRAFT') throw new ConflictException('Only DRAFT invoices can be edited');

    const totals = dto.items ? computeLineItemTotals(dto.items) : null;

    return this.prisma.$transaction(async (tx) => {
      if (totals) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceItem.createMany({
          data: totals.lines.map((line) => ({
            invoiceId: id,
            productId: line.productId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxPercent: line.taxPercent,
            discountAmount: line.discountAmount,
            lineTotal: line.lineTotal,
          })),
        });
      }
      return tx.invoice.update({
        where: { id },
        data: {
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          ...(totals && { subtotal: totals.subtotal, taxTotal: totals.taxTotal, discountTotal: totals.discountTotal, grandTotal: totals.grandTotal }),
        },
        include: INVOICE_INCLUDE,
      });
    });
  }

  async send(id: string) {
    const invoice = await this.findOne(id);
    if (invoice.status !== 'DRAFT') throw new ConflictException(`Only DRAFT invoices can be sent (current: ${invoice.status})`);
    return this.prisma.invoice.update({ where: { id }, data: { status: 'SENT' }, include: INVOICE_INCLUDE });
  }

  async void(id: string) {
    const invoice = await this.findOne(id);
    if (Number(invoice.amountPaid) > 0) {
      throw new ConflictException('Cannot void an invoice that already has payments recorded against it');
    }
    if (invoice.status === 'VOID') throw new ConflictException('Invoice is already void');
    return this.prisma.invoice.update({ where: { id }, data: { status: 'VOID' }, include: INVOICE_INCLUDE });
  }

  async getPdf(id: string): Promise<Buffer> {
    const invoice = await this.findOne(id);
    const settings = await this.prisma.companySettings.findFirst();
    return this.pdfService.generate(invoice, settings);
  }

  /** Shared by PaymentsService: applies a completed payment's amount to an invoice and reconciles its status. */
  async applyPayment(id: string, amount: number, tx: TransactionClient) {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
    if (!['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status)) {
      throw new BadRequestException(`Cannot record a payment against an invoice with status ${invoice.status}`);
    }
    const remaining = Number(invoice.grandTotal) - Number(invoice.amountPaid);
    if (amount > remaining) {
      throw new BadRequestException(`Payment amount ${amount} exceeds the remaining balance ${remaining}`);
    }

    const newAmountPaid = Number(invoice.amountPaid) + amount;
    return tx.invoice.update({
      where: { id },
      data: { amountPaid: newAmountPaid, status: resolveInvoiceStatus(newAmountPaid, Number(invoice.grandTotal), invoice.status) },
    });
  }

  /** Shared by PaymentsService.refund(): reverses a previously-applied payment amount. */
  async reversePayment(id: string, amount: number, tx: TransactionClient) {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
    const newAmountPaid = Math.max(0, Number(invoice.amountPaid) - amount);
    return tx.invoice.update({
      where: { id },
      data: { amountPaid: newAmountPaid, status: resolveInvoiceStatus(newAmountPaid, Number(invoice.grandTotal), invoice.status) },
    });
  }

  private async applyOverdueCheck<T extends { id: string; status: string; dueDate: Date }>(invoice: T): Promise<T> {
    const isPastDue = invoice.dueDate.getTime() < Date.now();
    if (isPastDue && (invoice.status === 'SENT' || invoice.status === 'PARTIALLY_PAID')) {
      await this.prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'OVERDUE' } });
      return { ...invoice, status: 'OVERDUE' };
    }
    return invoice;
  }
}
