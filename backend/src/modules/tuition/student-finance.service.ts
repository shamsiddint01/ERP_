import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Sums TuitionAllocation.amount across every non-cancelled TuitionCharge — the collected total, straight from the join table, never a cached counter. */
function allocatedTotal(charge: { allocations: Array<{ amount: unknown }> }): number {
  return charge.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
}

@Injectable()
export class StudentFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every figure here is computed live from TuitionCharge/TuitionAllocation
   * — Student itself carries no stored balance field (unlike Customer),
   * deliberately, so this can never drift from the real underlying rows.
   */
  async getBalance(studentId: string) {
    await this.assertStudentExists(studentId);
    const charges = await this.prisma.tuitionCharge.findMany({
      where: { studentId, status: { not: 'CANCELLED' } },
      include: { allocations: { select: { amount: true } } },
    });

    const now = new Date();
    let totalBilled = 0;
    let totalDiscounts = 0;
    let totalPaid = 0;
    let totalOverdue = 0;

    for (const charge of charges) {
      const net = Number(charge.netAmount);
      const paid = allocatedTotal(charge);
      const outstanding = net - paid;
      totalBilled += net;
      totalDiscounts += Number(charge.discountAmount);
      totalPaid += paid;
      if (outstanding > 0 && charge.dueDate.getTime() < now.getTime()) totalOverdue += outstanding;
    }

    return {
      studentId,
      totalBilled: round2(totalBilled),
      discounts: round2(totalDiscounts),
      paid: round2(totalPaid),
      outstanding: round2(totalBilled - totalPaid),
      overdue: round2(totalOverdue),
    };
  }

  /** The full "Student finance page" payload: balance + every charge + every payment + the allocation history that ties them together + active discount grants. */
  async getFinancialSummary(studentId: string) {
    const balance = await this.getBalance(studentId);

    const [charges, payments, discounts] = await Promise.all([
      this.prisma.tuitionCharge.findMany({
        where: { studentId },
        include: {
          enrollment: { select: { id: true, group: { select: { id: true, name: true, code: true } } } },
          allocations: {
            select: { id: true, amount: true, createdAt: true, payment: { select: { id: true, paymentNumber: true, method: true } } },
          },
        },
        orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.payment.findMany({
        where: { referenceType: 'TUITION_CHARGE', referenceId: studentId },
        include: { tuitionAllocations: { select: { id: true, amount: true, tuitionChargeId: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentDiscount.findMany({
        where: { studentId, isActive: true },
        include: { discount: true, enrollment: { select: { id: true, group: { select: { id: true, name: true } } } } },
        orderBy: { startDate: 'desc' },
      }),
    ]);

    const chargesWithOutstanding = charges.map((charge) => {
      const paid = allocatedTotal(charge);
      return { ...charge, allocatedAmount: round2(paid), outstanding: round2(Number(charge.netAmount) - paid) };
    });

    const allocationHistory = charges
      .flatMap((charge) => charge.allocations.map((allocation) => ({ ...allocation, tuitionChargeId: charge.id, billingPeriod: charge.billingPeriod })))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const paymentsWithUnallocated = payments.map((payment) => {
      const allocated = payment.tuitionAllocations.reduce((sum, a) => sum + Number(a.amount), 0);
      return { ...payment, allocatedAmount: round2(allocated), unallocatedAmount: round2(Number(payment.amount) - allocated) };
    });

    return { balance, charges: chargesWithOutstanding, payments: paymentsWithUnallocated, allocationHistory, discounts };
  }

  private async assertStudentExists(studentId: string): Promise<void> {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) throw new NotFoundException('Student not found');
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
