import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { generateDocumentNumber } from '../../shared/utils/document-number.util.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AllocatePaymentDto } from '../tuition/dto/allocate-payment.dto.js';
import { TuitionAllocationService } from '../tuition/tuition-allocation.service.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import type { QueryPaymentDto } from './dto/query-payment.dto.js';

const PAYMENT_INCLUDE = {
  recordedBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
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
      method: query.method,
      status: query.status ?? (query.paymentState === 'PAID' ? 'COMPLETED' : query.paymentState === 'UNPAID' ? { not: 'COMPLETED' } : undefined),
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

    return { items: await this.withStudents(items), total, page, pageSize };
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: PAYMENT_INCLUDE });
    if (!payment) throw new NotFoundException('Payment not found');
    const [withStudent] = await this.withStudents([payment]);
    return withStudent;
  }

  /** A Payment only stores the payer Student's id (referenceId) — resolves every row's student in one extra query. */
  private async withStudents<T extends { referenceId: string | null }>(payments: T[]) {
    const studentIds = [...new Set(payments.map((p) => p.referenceId).filter((id): id is string => !!id))];
    const students = studentIds.length
      ? await this.prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, studentCode: true, fullName: true } })
      : [];
    const byId = new Map(students.map((s) => [s.id, s]));
    return payments.map((p) => ({ ...p, student: p.referenceId ? (byId.get(p.referenceId) ?? null) : null }));
  }

  /**
   * Records cash received from a student. referenceId is the payer Student's
   * id, not a specific charge — this only records that the money arrived;
   * the per-charge breakdown happens separately via POST /payments/:id/allocate.
   */
  async create(dto: CreatePaymentDto, userId: string) {
    const { payment, student } = await this.prisma.$transaction(async (tx) => {
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
      return { payment, student };
    });

    // Notified only after the transaction commits, so a rollback can never leave a stray notification behind.
    await this.notifications.notifyByPermission('tuition', 'VIEW', {
      type: 'TUITION_PAYMENT_RECEIVED',
      title: "To'lov qabul qilindi",
      message: `${student.fullName} — ${Number(payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} to'lov qabul qilindi (${payment.paymentNumber}).`,
      referenceType: 'Payment',
      referenceId: payment.id,
      actionUrl: `/students/${student.id}?tab=finance`,
    });

    return payment;
  }

  /** Distributes a payment's amount across one or more TuitionCharges — see TuitionAllocationService for the concurrency-safe, never-over-allocate implementation. */
  async allocate(paymentId: string, dto: AllocatePaymentDto, userId: string) {
    return this.tuitionAllocationService.allocate(paymentId, dto.allocations, userId);
  }

  /** Un-does every allocation this payment made (each affected charge's status drops back accordingly), then marks it REFUNDED. */
  async refund(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id } });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status !== 'COMPLETED') {
        throw new ConflictException(`Only COMPLETED payments can be refunded (current: ${payment.status})`);
      }

      await this.tuitionAllocationService.reverseAllocationsForPayment(id, tx);

      const updateResult = await tx.payment.updateMany({ where: { id, status: payment.status }, data: { status: 'REFUNDED' } });
      if (updateResult.count === 0) throw new ConflictException('Payment status was changed concurrently — please retry');
      return tx.payment.findUniqueOrThrow({ where: { id }, include: PAYMENT_INCLUDE });
    });
  }
}
