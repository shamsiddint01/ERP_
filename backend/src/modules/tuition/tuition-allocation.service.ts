import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, TuitionChargeStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AllocationEntryDto } from './dto/allocate-payment.dto.js';

type TransactionClient = Prisma.TransactionClient;

/**
 * Mirrors resolveInvoiceStatus's exact shape (invoices.service.ts):
 * receiving money against an OVERDUE charge always clears the OVERDUE flag
 * (the next scheduler pass or lazy read re-flags it if it's genuinely still
 * both unpaid and past due), and zero allocated always resets to PENDING —
 * CANCELLED is the one state this never overrides.
 */
function resolveTuitionChargeStatus(allocatedAmount: number, netAmount: number, currentStatus: TuitionChargeStatus): TuitionChargeStatus {
  if (currentStatus === 'CANCELLED') return currentStatus;
  if (allocatedAmount <= 0) {
    return currentStatus === 'PAID' || currentStatus === 'PARTIALLY_PAID' || currentStatus === 'OVERDUE' ? 'PENDING' : currentStatus;
  }
  return allocatedAmount < netAmount ? 'PARTIALLY_PAID' : 'PAID';
}

const EPSILON = 1e-6;

@Injectable()
export class TuitionAllocationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Never over-allocates in either direction — the payment's own total
   * (unallocated = payment.amount - already allocated) and each individual
   * charge's own outstanding balance (netAmount - already allocated to it,
   * from ANY payment) are both re-checked live, inside one transaction,
   * after taking transaction-scoped advisory locks on the payment and every
   * charge involved (charge ids sorted first so two concurrent multi-charge
   * allocations can never deadlock against each other).
   */
  async allocate(paymentId: string, entries: AllocationEntryDto[], userId: string) {
    const chargeIds = [...new Set(entries.map((e) => e.tuitionChargeId))];
    if (chargeIds.length !== entries.length) throw new BadRequestException('Duplicate tuitionChargeId within the same allocation request');

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payment_allocate:' || ${paymentId}))`;
      for (const chargeId of [...chargeIds].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tuition_charge_allocate:' || ${chargeId}))`;
      }

      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.referenceType !== 'TUITION_CHARGE') throw new BadRequestException('Only tuition payments can be allocated via this endpoint');
      if (payment.status !== 'COMPLETED') throw new ConflictException(`Only a COMPLETED payment can be allocated (current: ${payment.status})`);

      const charges = await tx.tuitionCharge.findMany({ where: { id: { in: chargeIds } } });
      if (charges.length !== chargeIds.length) throw new NotFoundException('One or more tuition charges were not found');
      const chargeById = new Map(charges.map((c) => [c.id, c]));
      for (const charge of charges) {
        if (charge.studentId !== payment.referenceId) {
          throw new BadRequestException("Cannot allocate this payment to a charge that belongs to a different student");
        }
        if (charge.status === 'CANCELLED') throw new ConflictException(`Cannot allocate to a cancelled charge (${charge.id})`);
      }

      // "already allocated FROM THIS payment" per charge — replaced, not added to, by a re-allocation call.
      const existingForPayment = await tx.tuitionAllocation.findMany({ where: { paymentId, tuitionChargeId: { in: chargeIds } } });
      const existingByCharge = new Map(existingForPayment.map((a) => [a.tuitionChargeId, Number(a.amount)]));

      const paymentAllocatedAgg = await tx.tuitionAllocation.aggregate({ where: { paymentId }, _sum: { amount: true } });
      const paymentAllocatedTotal = Number(paymentAllocatedAgg._sum.amount ?? 0);
      const unallocated = Number(payment.amount) - paymentAllocatedTotal;
      const netNewAmount = entries.reduce((sum, e) => sum + (e.amount - (existingByCharge.get(e.tuitionChargeId) ?? 0)), 0);
      if (netNewAmount > unallocated + EPSILON) {
        throw new ConflictException(
          `This allocation would leave the payment over-allocated: ${netNewAmount.toFixed(2)} requested but only ${unallocated.toFixed(2)} unallocated`,
        );
      }

      const results = [];
      for (const entry of entries) {
        const charge = chargeById.get(entry.tuitionChargeId)!;
        const chargeAllocatedAgg = await tx.tuitionAllocation.aggregate({ where: { tuitionChargeId: charge.id }, _sum: { amount: true } });
        const chargeAllocatedTotal = Number(chargeAllocatedAgg._sum.amount ?? 0);
        const existingFromThisPayment = existingByCharge.get(charge.id) ?? 0;
        const chargeOutstanding = Number(charge.netAmount) - (chargeAllocatedTotal - existingFromThisPayment);
        if (entry.amount > chargeOutstanding + EPSILON) {
          throw new ConflictException(
            `Allocation of ${entry.amount.toFixed(2)} exceeds this charge's outstanding balance of ${chargeOutstanding.toFixed(2)}`,
          );
        }

        const allocation = await tx.tuitionAllocation.upsert({
          where: { paymentId_tuitionChargeId: { paymentId, tuitionChargeId: charge.id } },
          create: { paymentId, tuitionChargeId: charge.id, amount: entry.amount, allocatedByUserId: userId },
          update: { amount: entry.amount, allocatedByUserId: userId },
        });
        results.push(allocation);

        const newChargeAllocatedTotal = chargeAllocatedTotal - existingFromThisPayment + entry.amount;
        const newStatus = resolveTuitionChargeStatus(newChargeAllocatedTotal, Number(charge.netAmount), charge.status);
        const updateResult = await tx.tuitionCharge.updateMany({ where: { id: charge.id, status: charge.status }, data: { status: newStatus } });
        if (updateResult.count === 0) throw new ConflictException('This charge was changed concurrently — please retry');
      }

      return {
        id: paymentId,
        paymentId,
        unallocated: Math.max(0, unallocated - netNewAmount),
        allocations: results,
      };
    });
  }

  /** Shared by PaymentsService.refund(): removes every allocation this payment made and recomputes each affected charge's status back down. */
  async reverseAllocationsForPayment(paymentId: string, tx: TransactionClient): Promise<void> {
    const allocations = await tx.tuitionAllocation.findMany({ where: { paymentId } });
    for (const allocation of allocations) {
      const charge = await tx.tuitionCharge.findUniqueOrThrow({ where: { id: allocation.tuitionChargeId } });
      const remainingAgg = await tx.tuitionAllocation.aggregate({
        where: { tuitionChargeId: charge.id, id: { not: allocation.id } },
        _sum: { amount: true },
      });
      const remainingTotal = Number(remainingAgg._sum.amount ?? 0);
      const newStatus = resolveTuitionChargeStatus(remainingTotal, Number(charge.netAmount), charge.status);
      await tx.tuitionCharge.updateMany({ where: { id: charge.id, status: charge.status }, data: { status: newStatus } });
    }
    await tx.tuitionAllocation.deleteMany({ where: { paymentId } });
  }
}
