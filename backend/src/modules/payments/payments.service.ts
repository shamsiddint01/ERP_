import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { FinanceLedgerService } from '../../shared/finance/finance-ledger.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { generateDocumentNumber } from '../../shared/utils/document-number.util.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AllocatePaymentDto } from '../tuition/dto/allocate-payment.dto.js';
import { TuitionAllocationService } from '../tuition/tuition-allocation.service.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { PurchasesService } from '../purchases/purchases.service.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import type { QueryPaymentDto } from './dto/query-payment.dto.js';

const PAYMENT_INCLUDE = {
  payerCustomer: { select: { id: true, name: true, companyName: true } },
  payeeSupplier: { select: { id: true, companyName: true } },
  recordedBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly invoicesService: InvoicesService,
    private readonly purchasesService: PurchasesService,
    private readonly financeLedger: FinanceLedgerService,
    private readonly tuitionAllocationService: TuitionAllocationService,
    private readonly notifications: NotificationsService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Payment', (id) => this.prisma.payment.findUnique({ where: { id } }));
  }

  async findAll(query: QueryPaymentDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PaymentWhereInput = {
      payerCustomerId: query.customerId,
      payeeSupplierId: query.supplierId,
      method: query.method,
      status: query.status,
      referenceType: query.referenceType,
      referenceId: query.referenceId,
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
   * Records a completed payment in one transaction. Two shapes:
   *  - Customer payment (referenceType ORDER/INVOICE, direction INBOUND):
   *    reconciles the target's amountPaid/status (rejecting overpayment),
   *    keeps a linked Order in sync when the target is its Invoice, decreases
   *    the customer's outstanding balance, and posts Dr Cash/Bank / Cr AR.
   *  - Supplier payment (referenceType PURCHASE_ORDER, direction OUTBOUND):
   *    reconciles the purchase order's amountPaid/status, decreases the
   *    supplier's outstanding balance, and posts Dr AP / Cr Cash/Bank.
   */
  async create(dto: CreatePaymentDto, userId: string) {
    // Captured inside the transaction, read after it commits — notifying
    // before the transaction is durably committed would let the
    // notification survive a later rollback within the same call.
    let tuitionPaymentReceived: { paymentId: string; studentId: string; studentName: string } | undefined;

    const payment = await this.prisma.$transaction(async (tx) => {
      if (dto.referenceType === 'PURCHASE_ORDER') {
        const po = await tx.purchaseOrder.findUnique({ where: { id: dto.referenceId } });
        if (!po) throw new NotFoundException('Purchase order not found');
        await this.purchasesService.applyPayment(dto.referenceId, dto.amount, tx);

        const paymentNumber = await generateDocumentNumber('PAY', () => tx.payment.count());
        const payment = await tx.payment.create({
          data: {
            paymentNumber,
            direction: 'OUTBOUND',
            amount: dto.amount,
            method: dto.method,
            status: 'COMPLETED',
            payeeSupplierId: po.supplierId,
            referenceType: dto.referenceType,
            referenceId: dto.referenceId,
            externalTransactionId: dto.externalTransactionId,
            paidAt: new Date(),
            recordedByUserId: userId,
            notes: dto.notes,
          },
          include: PAYMENT_INCLUDE,
        });

        await tx.supplier.update({ where: { id: po.supplierId }, data: { balance: { decrement: dto.amount } } });

        await this.financeLedger.recordSupplierPayment(
          { amount: dto.amount, method: dto.method, paymentId: payment.id, paymentNumber: payment.paymentNumber, createdByUserId: userId },
          tx,
        );

        return payment;
      }

      // Phase G: referenceId is the payer Student's id, not a specific
      // charge — this only records that cash was received; it deliberately
      // does NOT touch any TuitionCharge (no payerCustomerId either, since
      // the payer is a Student, never a Customer). The actual per-charge
      // breakdown happens separately via POST /payments/:id/allocate.
      if (dto.referenceType === 'TUITION_CHARGE') {
        const student = await tx.student.findUnique({ where: { id: dto.referenceId } });
        if (!student) throw new NotFoundException('Student not found');

        const paymentNumber = await generateDocumentNumber('PAY', () => tx.payment.count());
        const payment = await tx.payment.create({
          data: {
            paymentNumber,
            direction: 'INBOUND',
            amount: dto.amount,
            method: dto.method,
            status: 'COMPLETED',
            referenceType: dto.referenceType,
            referenceId: dto.referenceId,
            externalTransactionId: dto.externalTransactionId,
            paidAt: new Date(),
            recordedByUserId: userId,
            notes: dto.notes,
          },
          include: PAYMENT_INCLUDE,
        });

        // Reused verbatim from the Customer path below — this is exactly
        // "Dr Cash/Bank / Cr Accounts Receivable" regardless of whether the
        // payer is a retail Customer or a Student; FinanceLedgerService has
        // no Customer-specific coupling, so no tuition-specific ledger
        // method is needed here (spec: "Do not introduce another ledger").
        await this.financeLedger.recordCustomerPayment(
          { amount: dto.amount, method: dto.method, paymentId: payment.id, paymentNumber: payment.paymentNumber, createdByUserId: userId },
          tx,
        );

        tuitionPaymentReceived = { paymentId: payment.id, studentId: student.id, studentName: student.fullName };
        return payment;
      }

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

      await this.financeLedger.recordCustomerPayment(
        { amount: dto.amount, method: dto.method, paymentId: payment.id, paymentNumber: payment.paymentNumber, createdByUserId: userId },
        tx,
      );

      return payment;
    });

    if (tuitionPaymentReceived) {
      await this.notifications.notifyByPermission('tuition', 'VIEW', {
        type: 'TUITION_PAYMENT_RECEIVED',
        title: "To'lov qabul qilindi",
        message: `${tuitionPaymentReceived.studentName} — ${Number(payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} to'lov qabul qilindi (${payment.paymentNumber}).`,
        referenceType: 'Payment',
        referenceId: tuitionPaymentReceived.paymentId,
        actionUrl: `/students/${tuitionPaymentReceived.studentId}/finance`,
      });
    }

    return payment;
  }

  /** Distributes a TUITION_CHARGE payment's amount across one or more TuitionCharges — see TuitionAllocationService for the concurrency-safe, never-over-allocate implementation. */
  async allocate(paymentId: string, dto: AllocatePaymentDto, userId: string) {
    return this.tuitionAllocationService.allocate(paymentId, dto.allocations, userId);
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

      if (payment.referenceType === 'PURCHASE_ORDER') {
        await this.purchasesService.reversePayment(payment.referenceId, amount, tx);
        if (payment.payeeSupplierId) {
          await tx.supplier.update({ where: { id: payment.payeeSupplierId }, data: { balance: { increment: amount } } });
        }
        await this.financeLedger.recordSupplierRefund(
          { amount, method: payment.method, paymentId: payment.id, paymentNumber: payment.paymentNumber, createdByUserId: userId },
          tx,
        );
        const updateResult = await tx.payment.updateMany({ where: { id, status: payment.status }, data: { status: 'REFUNDED' } });
        if (updateResult.count === 0) throw new ConflictException('Payment status was changed concurrently — please retry');
        return tx.payment.findUniqueOrThrow({ where: { id }, include: PAYMENT_INCLUDE });
      }

      if (payment.referenceType === 'ORDER') {
        await this.ordersService.reversePayment(payment.referenceId, amount, tx);
      } else if (payment.referenceType === 'INVOICE') {
        const invoice = await tx.invoice.findUnique({ where: { id: payment.referenceId } });
        await this.invoicesService.reversePayment(payment.referenceId, amount, tx);
        if (invoice?.orderId) await this.ordersService.reversePayment(invoice.orderId, amount, tx);
      } else if (payment.referenceType === 'TUITION_CHARGE') {
        // Un-does every allocation this payment made (each affected charge's
        // status drops back down accordingly) before the cash-side reversal
        // below — there is no Customer.balance to restore (the payer was a
        // Student), which is exactly why the payerCustomerId branch after
        // this is skipped for a tuition refund.
        await this.tuitionAllocationService.reverseAllocationsForPayment(id, tx);
      }

      if (payment.payerCustomerId) {
        await tx.customer.update({ where: { id: payment.payerCustomerId }, data: { balance: { increment: amount } } });
      }

      await this.financeLedger.recordCustomerRefund(
        { amount, method: payment.method, paymentId: payment.id, paymentNumber: payment.paymentNumber, createdByUserId: userId },
        tx,
      );

      const updateResult = await tx.payment.updateMany({ where: { id, status: payment.status }, data: { status: 'REFUNDED' } });
      if (updateResult.count === 0) throw new ConflictException('Payment status was changed concurrently — please retry');
      return tx.payment.findUniqueOrThrow({ where: { id }, include: PAYMENT_INCLUDE });
    });
  }
}
