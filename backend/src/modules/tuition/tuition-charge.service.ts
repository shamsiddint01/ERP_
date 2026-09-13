import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, TuitionChargeStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { FinanceLedgerService } from '../../shared/finance/finance-ledger.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateTuitionChargeDto } from './dto/create-tuition-charge.dto.js';
import type { QueryTuitionChargeDto } from './dto/query-tuition-charge.dto.js';
import type { UpdateTuitionChargeDto } from './dto/update-tuition-charge.dto.js';

type TransactionClient = Prisma.TransactionClient;

const TUITION_CHARGE_INCLUDE = {
  student: { select: { id: true, studentCode: true, fullName: true } },
  enrollment: {
    select: {
      id: true,
      startDate: true,
      endDate: true,
      status: true,
      group: { select: { id: true, name: true, code: true, branch: { select: { id: true, name: true } } } },
    },
  },
  allocations: {
    select: {
      id: true,
      amount: true,
      createdAt: true,
      payment: { select: { id: true, paymentNumber: true, method: true, paidAt: true } },
      allocatedBy: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.TuitionChargeInclude;

/** ACTIVE_ENROLLMENT_STATUSES-style guard isn't needed here — a charge may be billed against any non-cancelled enrollment (a COMPLETED one can still legitimately owe its last month's tuition). */
const CANCELLED_ENROLLMENT_STATUS = 'CANCELLED';

@Injectable()
export class TuitionChargeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeLedger: FinanceLedgerService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('TuitionCharge', (id) => this.prisma.tuitionCharge.findUnique({ where: { id } }));
  }

  async findAll(query: QueryTuitionChargeDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.TuitionChargeWhereInput = {
      studentId: query.studentId,
      enrollmentId: query.enrollmentId,
      status: query.status,
      billingPeriod: query.billingPeriod,
      ...((query.dueDateFrom || query.dueDateTo) && {
        dueDate: {
          gte: query.dueDateFrom ? new Date(query.dueDateFrom) : undefined,
          lte: query.dueDateTo ? new Date(query.dueDateTo) : undefined,
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.tuitionCharge.findMany({
        where,
        include: TUITION_CHARGE_INCLUDE,
        orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tuitionCharge.count({ where }),
    ]);

    return { items: await Promise.all(items.map((item) => this.applyOverdueCheck(item))), total, page, pageSize };
  }

  async findOne(id: string) {
    const charge = await this.prisma.tuitionCharge.findUnique({ where: { id }, include: TUITION_CHARGE_INCLUDE });
    if (!charge) throw new NotFoundException('Tuition charge not found');
    return this.applyOverdueCheck(charge);
  }

  /**
   * Bills one student for one enrollment's billing period. Discount is
   * always computed here, from the student's currently-active
   * StudentDiscount grants as of `dueDate` — never client-supplied, and
   * never revisited afterward (a StudentDiscount added/changed/removed
   * later has zero effect on this charge, by design). Posts Dr Accounts
   * Receivable / Cr Tuition Revenue for the resulting netAmount.
   */
  async create(dto: CreateTuitionChargeDto, userId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: dto.enrollmentId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (enrollment.studentId !== dto.studentId) {
      throw new BadRequestException("The enrollment does not belong to the selected student");
    }
    if (enrollment.status === CANCELLED_ENROLLMENT_STATUS) {
      throw new ConflictException('Cannot bill a cancelled enrollment');
    }

    const student = await this.prisma.student.findUnique({ where: { id: dto.studentId } });
    if (!student) throw new NotFoundException('Student not found');

    const amount = dto.amount ?? (enrollment.agreedTuition !== null ? Number(enrollment.agreedTuition) : undefined);
    if (amount === undefined) {
      throw new BadRequestException('amount was not provided and the enrollment has no agreedTuition to default from');
    }
    const dueDate = new Date(dto.dueDate);
    if (Number.isNaN(dueDate.getTime())) throw new BadRequestException('Invalid dueDate');

    return this.prisma.$transaction(async (tx) => {
      // Transaction-scoped advisory lock keyed on (enrollment, billing
      // period): the only thing standing between "duplicate billing" and a
      // genuine race, since there is deliberately no DB unique constraint
      // to enforce it (see TuitionCharge's own doc comment for why).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tuition_charge:' || ${dto.enrollmentId} || ':' || ${dto.billingPeriod}))`;

      if (!dto.allowDuplicate) {
        const existing = await tx.tuitionCharge.findFirst({
          where: { enrollmentId: dto.enrollmentId, billingPeriod: dto.billingPeriod, status: { not: 'CANCELLED' } },
        });
        if (existing) {
          throw new ConflictException(
            `A tuition charge for this enrollment and billing period (${dto.billingPeriod}) already exists — pass allowDuplicate to bill again anyway`,
          );
        }
      }

      const discountAmount = await this.computeActiveDiscount(tx, dto.studentId, dto.enrollmentId, amount, dueDate);
      const netAmount = amount - discountAmount;

      const charge = await tx.tuitionCharge.create({
        data: {
          studentId: dto.studentId,
          enrollmentId: dto.enrollmentId,
          billingPeriod: dto.billingPeriod,
          amount,
          discountAmount,
          netAmount,
          dueDate,
          description: dto.description,
        },
        include: TUITION_CHARGE_INCLUDE,
      });

      if (netAmount > 0) {
        await this.financeLedger.recordTuitionCharge(
          { netAmount, chargeId: charge.id, studentName: student.fullName, billingPeriod: dto.billingPeriod, createdByUserId: userId },
          tx,
        );
      }

      return charge;
    });
  }

  async update(id: string, dto: UpdateTuitionChargeDto) {
    const charge = await this.findOne(id);
    if (charge.status === 'CANCELLED') throw new ConflictException('Cannot edit a cancelled tuition charge');

    return this.prisma.tuitionCharge.update({
      where: { id },
      data: {
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        description: dto.description,
      },
      include: TUITION_CHARGE_INCLUDE,
    });
  }

  /**
   * Only reachable while nothing has been allocated against this charge yet
   * — once a payment has touched it, cancelling would leave that money
   * allocated to a charge that officially never happened. Reverses the
   * original billing entry (Dr Tuition Revenue / Cr Accounts Receivable).
   */
  async cancel(id: string, userId: string) {
    const charge = await this.prisma.tuitionCharge.findUnique({
      where: { id },
      include: { student: { select: { fullName: true } }, allocations: { select: { id: true } } },
    });
    if (!charge) throw new NotFoundException('Tuition charge not found');
    if (charge.status === 'CANCELLED') throw new ConflictException('This charge is already cancelled');
    if (charge.allocations.length > 0) {
      throw new ConflictException('Cannot cancel a tuition charge that already has payments allocated to it');
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.tuitionCharge.updateMany({ where: { id, status: charge.status }, data: { status: 'CANCELLED' } });
      if (result.count === 0) throw new ConflictException('This charge was changed concurrently — please retry');

      if (Number(charge.netAmount) > 0) {
        await this.financeLedger.recordTuitionChargeCancellation(
          { netAmount: Number(charge.netAmount), chargeId: charge.id, studentName: charge.student.fullName, billingPeriod: charge.billingPeriod, createdByUserId: userId },
          tx,
        );
      }

      return tx.tuitionCharge.findUniqueOrThrow({ where: { id }, include: TUITION_CHARGE_INCLUDE });
    });
  }

  /**
   * Sums the student's currently-active StudentDiscount grants (student-wide
   * or scoped to this exact enrollment) as of `asOfDate`, applies each to
   * `amount` (PERCENTAGE discounts are a % of amount; every other type is a
   * flat currency value), and clamps the total so a stack of discounts can
   * never make netAmount negative.
   */
  private async computeActiveDiscount(tx: TransactionClient, studentId: string, enrollmentId: string, amount: number, asOfDate: Date): Promise<number> {
    const grants = await tx.studentDiscount.findMany({
      where: {
        studentId,
        isActive: true,
        startDate: { lte: asOfDate },
        AND: [{ OR: [{ enrollmentId }, { enrollmentId: null }] }, { OR: [{ endDate: null }, { endDate: { gte: asOfDate } }] }],
      },
      include: { discount: true },
    });

    let total = 0;
    for (const grant of grants) {
      if (!grant.discount.isActive) continue;
      total += grant.discount.type === 'PERCENTAGE' ? (amount * Number(grant.discount.value)) / 100 : Number(grant.discount.value);
    }
    return Math.min(Math.max(total, 0), amount);
  }

  private async applyOverdueCheck<T extends { id: string; status: TuitionChargeStatus; dueDate: Date }>(charge: T): Promise<T> {
    const isPastDue = charge.dueDate.getTime() < Date.now();
    if (isPastDue && (charge.status === 'PENDING' || charge.status === 'PARTIALLY_PAID')) {
      await this.prisma.tuitionCharge.update({ where: { id: charge.id }, data: { status: 'OVERDUE' } });
      return { ...charge, status: 'OVERDUE' };
    }
    return charge;
  }
}
