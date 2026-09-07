import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { FinanceLedgerService } from '../../shared/finance/finance-ledger.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { generateDocumentNumber } from '../../shared/utils/document-number.util.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import { OrdersService } from '../orders/orders.service.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import type { QueryPaymentDto } from './dto/query-payment.dto.js';

const PAYMENT_INCLUDE = {
  payerCustomer: { select: { id: true, name: true, companyName: true } },
  recordedBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly invoicesService: InvoicesService,
    private readonly financeLedger: FinanceLedgerService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Payment', (id) => this.prisma.payment.findUnique({ where: { id } }));
  }

  async findAll(query: QueryPaymentDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PaymentWhereInput = {
      payerCustomerId: query.customerId,
      method: query.method,
      status: query.status,
      ...(query.search && { paymentNumber: { contains: query.search, mode: 'insensitive' } }),
      ...((query.from || query.to) && {
        createdAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: PAYMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: PAYMENT_INCLUDE });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  /**
   * Records money received against an Order or Invoice, in one transaction:
   * reconciles the target's amountPaid/status (rejecting overpayment), keeps
   * a linked Order in sync when the target is its Invoice, updates the
   * customer's outstanding balance, and posts a PAYMENT_IN ledger entry.
   */
  async create(dto: CreatePaymentDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      let payerCustomerId: string;

      if (dto.referenceType === 'ORDER') {
        const order = await tx.order.findUnique({ where: { id: dto.referenceId } });
        if (!order) throw new NotFoundException('Order not found');
        payerCustomerId = order.customerId;
        await this.ordersService.applyPayment(dto.referenceId, dto.amount, tx);
      } else {
        const invoice = await tx.invoice.findUnique({ where: { id: dto.referenceId } });
        if (!invoice) throw new NotFoundException('Invoice not found');
        payerCustomerId = invoice.customerId;
        await this.invoicesService.applyPayment(dto.referenceId, dto.amount, tx);
        if (invoice.orderId) {
          await this.ordersService.applyPayment(invoice.orderId, dto.amount, tx);
        }
      }

      const paymentNumber = await generateDocumentNumber('PAY', () => tx.payment.count());
      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          direction: 'INBOUND',
          amount: dto.amount,
          method: dto.method,
          status: 'COMPLETED',
          payerCustomerId,
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
          externalTransactionId: dto.externalTransactionId,
          paidAt: new Date(),
          recordedByUserId: userId,
          notes: dto.notes,
        },
        include: PAYMENT_INCLUDE,
      });

      await tx.customer.update({ where: { id: payerCustomerId }, data: { balance: { decrement: dto.amount } } });

      await this.financeLedger.recordTransaction(
        {
          type: 'PAYMENT_IN',
          amount: dto.amount,
          referenceType: 'PAYMENT',
          referenceId: payment.id,
          description: `Payment ${payment.paymentNumber} received via ${dto.method}`,
          createdByUserId: userId,
        },
        tx,
      );

      return payment;
    });
  }

  async refund(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id } });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status !== 'COMPLETED') {
        throw new ConflictException(`Only COMPLETED payments can be refunded (current: ${payment.status})`);
      }
      if (!payment.referenceId || !payment.referenceType) {
        throw new BadRequestException('Payment has no reference to reverse');
      }

      const amount = Number(payment.amount);
      if (payment.referenceType === 'ORDER') {
        await this.ordersService.reversePayment(payment.referenceId, amount, tx);
      } else if (payment.referenceType === 'INVOICE') {
        const invoice = await tx.invoice.findUnique({ where: { id: payment.referenceId } });
        await this.invoicesService.reversePayment(payment.referenceId, amount, tx);
        if (invoice?.orderId) await this.ordersService.reversePayment(invoice.orderId, amount, tx);
      }

      if (payment.payerCustomerId) {
        await tx.customer.update({ where: { id: payment.payerCustomerId }, data: { balance: { increment: amount } } });
      }

      await this.financeLedger.recordTransaction(
        {
          type: 'REFUND',
          amount: -amount,
          referenceType: 'PAYMENT',
          referenceId: payment.id,
          description: `Refund for payment ${payment.paymentNumber}`,
          createdByUserId: userId,
        },
        tx,
      );

      return tx.payment.update({ where: { id }, data: { status: 'REFUNDED' }, include: PAYMENT_INCLUDE });
    });
  }
}
