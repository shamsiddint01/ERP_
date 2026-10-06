import 'dotenv/config';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditEntityRegistryService } from '../src/shared/audit/audit-entity-registry.service.js';
import { StudentFinanceService } from '../src/modules/tuition/student-finance.service.js';
import { TuitionAllocationService } from '../src/modules/tuition/tuition-allocation.service.js';
import { TuitionChargeService } from '../src/modules/tuition/tuition-charge.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Genuine concurrency coverage for tuition billing — runs the REAL
 * TuitionChargeService/TuitionAllocationService against the REAL dev
 * Postgres (no mocks), firing truly parallel requests to prove the
 * transaction-scoped advisory locks actually serialize them. Every row is
 * created under the `ZZCONG-` prefix and removed in afterAll.
 */
const prisma = new PrismaService();
const registry = new AuditEntityRegistryService();
const tuitionChargeService = new TuitionChargeService(prisma, registry);
const tuitionAllocationService = new TuitionAllocationService(prisma);
const studentFinanceService = new StudentFinanceService(prisma);

const P = 'ZZCONG-';

let branchId: string;
let courseId: string;
let groupId: string;
let adminUserId: string;
const studentIds: string[] = [];
const enrollmentIds: string[] = [];
const paymentIds: string[] = [];

async function makeStudentAndEnrollment(tag: string, agreedTuition: number) {
  const student = await prisma.student.create({
    data: { studentCode: `${P}STU-${tag}`, firstName: 'Concurrency', lastName: tag, fullName: `Concurrency ${tag}`, branchId, status: 'ACTIVE' },
  });
  studentIds.push(student.id);
  const enrollment = await prisma.enrollment.create({
    data: { studentId: student.id, groupId, startDate: new Date('2026-09-01'), status: 'ACTIVE', agreedTuition },
  });
  enrollmentIds.push(enrollment.id);
  return { studentId: student.id, enrollmentId: enrollment.id };
}

/** Mirrors PaymentsService.create closely enough to exercise TuitionAllocationService for real: a COMPLETED payment referencing the student. */
async function createCompletedTuitionPayment(studentId: string, amount: number): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const paymentNumber = `${P}PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        direction: 'INBOUND',
        amount,
        method: 'CASH',
        status: 'COMPLETED',
        referenceType: 'TUITION_CHARGE',
        referenceId: studentId,
        paidAt: new Date(),
        recordedByUserId: adminUserId,
      },
    });
    paymentIds.push(payment.id);
    return payment.id;
  });
}

beforeAll(async () => {
  const branch = await prisma.branch.create({ data: { code: `${P}BR`, name: 'Concurrency Branch (Tuition)' } });
  branchId = branch.id;
  const course = await prisma.course.create({ data: { code: `${P}CRS`, name: 'Concurrency Course (Tuition)', defaultTuition: '500000', status: 'ACTIVE' } });
  courseId = course.id;
  const group = await prisma.studentGroup.create({
    data: { code: `${P}GRP`, name: 'Concurrency Group (Tuition)', courseId, branchId, capacity: 50, startDate: new Date('2026-09-01'), status: 'ACTIVE' },
  });
  groupId = group.id;
  const admin = await prisma.user.findFirstOrThrow({ where: { username: 'admin' }, select: { id: true } });
  adminUserId = admin.id;
});

afterAll(async () => {
  await prisma.tuitionAllocation.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.tuitionCharge.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
  await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.studentGroup.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.course.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.branch.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.$disconnect();
});

describe('Duplicate-billing concurrency (Phase G, real Postgres, no mocks)', () => {
  it('two concurrent charges for the same enrollment+billingPeriod: exactly one succeeds, the other gets 409, and only one non-cancelled charge exists afterward', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('DUP', 500000);
    const dto = { studentId, enrollmentId, billingPeriod: '2026-10', amount: 500000, dueDate: '2026-10-05T00:00:00.000Z' };

    const results = await Promise.allSettled([
      tuitionChargeService.create(dto as never),
      tuitionChargeService.create(dto as never),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ id: string }>[];
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const nonCancelledCount = await prisma.tuitionCharge.count({ where: { enrollmentId, billingPeriod: '2026-10', status: { not: 'CANCELLED' } } });
    expect(nonCancelledCount).toBe(1);
  });

  it('allowDuplicate explicitly overrides the duplicate check — a deliberate second bill for the same period is allowed', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('OVERRIDE', 500000);
    const dto = { studentId, enrollmentId, billingPeriod: '2026-11', amount: 500000, dueDate: '2026-11-05T00:00:00.000Z' };

    const first = await tuitionChargeService.create(dto as never);
    const second = await tuitionChargeService.create({ ...dto, allowDuplicate: true } as never);

    const count = await prisma.tuitionCharge.count({ where: { enrollmentId, billingPeriod: '2026-11' } });
    expect(count).toBe(2);
  });
});

describe('Payment-allocation concurrency (Phase G — the critical "no over-allocation" guarantee, real Postgres, no mocks)', () => {
  // NB: repeating the exact SAME (paymentId, tuitionChargeId) pair across
  // concurrent calls does NOT exercise the race — upsert makes a retry of an
  // identical entry a no-op replacement (see resolveTuitionChargeStatus /
  // the existingByCharge delta math), not an additive allocation. A genuine
  // over-allocation race needs independent write paths: either several
  // DIFFERENT payments racing to pay off the SAME charge (charge-level cap),
  // or one payment racing to spread itself across several DIFFERENT charges
  // beyond its own total (payment-level cap). Both are covered below.

  it('3 concurrent payments racing to pay off the SAME 300000 charge in full: exactly one succeeds, no over-allocation', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('ALLOC3', 300000);
    const charge = await tuitionChargeService.create({ studentId, enrollmentId, billingPeriod: '2026-09', amount: 300000, dueDate: '2026-09-30T00:00:00.000Z' } as never);
    // Fixture setup runs SEQUENTIALLY — only the allocate() calls below are
    // the concurrent operation under test.
    const paymentA = await createCompletedTuitionPayment(studentId, 300000);
    const paymentB = await createCompletedTuitionPayment(studentId, 300000);
    const paymentC = await createCompletedTuitionPayment(studentId, 300000);

    const results = await Promise.allSettled([
      tuitionAllocationService.allocate(paymentA, [{ tuitionChargeId: charge.id, amount: 300000 }], adminUserId),
      tuitionAllocationService.allocate(paymentB, [{ tuitionChargeId: charge.id, amount: 300000 }], adminUserId),
      tuitionAllocationService.allocate(paymentC, [{ tuitionChargeId: charge.id, amount: 300000 }], adminUserId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(ConflictException);

    const allocatedAgg = await prisma.tuitionAllocation.aggregate({ where: { tuitionChargeId: charge.id }, _sum: { amount: true } });
    expect(Number(allocatedAgg._sum.amount ?? 0)).toBe(300000);

    const finalCharge = await prisma.tuitionCharge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(finalCharge.status).toBe('PAID');
  });

  it('3 concurrent partial payments (150000 each) racing to pay off the SAME 300000 charge: exactly two succeed, total allocated never exceeds netAmount', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('ALLOCPART', 300000);
    const charge = await tuitionChargeService.create({ studentId, enrollmentId, billingPeriod: '2026-09', amount: 300000, dueDate: '2026-09-30T00:00:00.000Z' } as never);
    // Sequential fixture setup — see the note in the previous test.
    const paymentA = await createCompletedTuitionPayment(studentId, 150000);
    const paymentB = await createCompletedTuitionPayment(studentId, 150000);
    const paymentC = await createCompletedTuitionPayment(studentId, 150000);

    const results = await Promise.allSettled([
      tuitionAllocationService.allocate(paymentA, [{ tuitionChargeId: charge.id, amount: 150000 }], adminUserId),
      tuitionAllocationService.allocate(paymentB, [{ tuitionChargeId: charge.id, amount: 150000 }], adminUserId),
      tuitionAllocationService.allocate(paymentC, [{ tuitionChargeId: charge.id, amount: 150000 }], adminUserId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);

    const allocatedAgg = await prisma.tuitionAllocation.aggregate({ where: { tuitionChargeId: charge.id }, _sum: { amount: true } });
    expect(Number(allocatedAgg._sum.amount ?? 0)).toBe(300000);
  });

  it('one 300000 payment racing to spread 150000 slices across 3 DIFFERENT charges: payment-level cap enforced, exactly two succeed', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('ALLOCMULTI', 0);
    // Sequential fixture setup — see the note in the first test of this describe block.
    const charges = [];
    for (const billingPeriod of ['2026-09', '2026-10', '2026-11']) {
      charges.push(await tuitionChargeService.create({ studentId, enrollmentId, billingPeriod, amount: 200000, dueDate: `${billingPeriod}-25T00:00:00.000Z` } as never));
    }
    // Payment covers exactly two 150000 slices (300000) — of the 3 racing
    // slices against 3 distinct charges (so the CHARGE-level cap never
    // trips, each charge has 200000 of room), only the PAYMENT-level cap can
    // block the 3rd.
    const paymentId = await createCompletedTuitionPayment(studentId, 300000);

    const results = await Promise.allSettled(
      charges.map((charge) => tuitionAllocationService.allocate(paymentId, [{ tuitionChargeId: charge.id, amount: 150000 }], adminUserId)),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);

    const totalAllocated = await prisma.tuitionAllocation.aggregate({ where: { paymentId }, _sum: { amount: true } });
    expect(Number(totalAllocated._sum.amount ?? 0)).toBe(300000);
  });
});

describe('Cancelling a charge (real Postgres, no mocks)', () => {
  it('marks an unallocated charge CANCELLED', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('CANCEL', 100000);
    const charge = await tuitionChargeService.create({ studentId, enrollmentId, billingPeriod: '2026-09', amount: 100000, dueDate: '2026-09-30T00:00:00.000Z' } as never);

    await tuitionChargeService.cancel(charge.id);

    const cancelled = await prisma.tuitionCharge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('refuses to cancel a charge that already has an allocation against it', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('CANCEL-BLOCKED', 120000);
    const charge = await tuitionChargeService.create({ studentId, enrollmentId, billingPeriod: '2026-09', amount: 120000, dueDate: '2026-09-30T00:00:00.000Z' } as never);
    const paymentId = await createCompletedTuitionPayment(studentId, 120000);
    await tuitionAllocationService.allocate(paymentId, [{ tuitionChargeId: charge.id, amount: 120000 }], adminUserId);

    await expect(tuitionChargeService.cancel(charge.id)).rejects.toThrow(ConflictException);
  });
});

describe('Student balance & lazy overdue (Phase G, real Postgres, no mocks)', () => {
  it('getBalance computes totalBilled/paid/outstanding/overdue purely from live TuitionCharge/TuitionAllocation rows', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('BALANCE', 500000);
    const pastDueCharge = await tuitionChargeService.create({ studentId, enrollmentId, billingPeriod: '2026-07', amount: 500000, dueDate: '2026-07-01T00:00:00.000Z' } as never);
    const futureCharge = await tuitionChargeService.create({ studentId, enrollmentId, billingPeriod: '2026-12', amount: 300000, dueDate: '2026-12-31T00:00:00.000Z' } as never);
    const paymentId = await createCompletedTuitionPayment(studentId, 200000);
    await tuitionAllocationService.allocate(paymentId, [{ tuitionChargeId: pastDueCharge.id, amount: 200000 }], adminUserId);

    const balance = await studentFinanceService.getBalance(studentId);

    expect(balance.totalBilled).toBe(800000);
    expect(balance.paid).toBe(200000);
    expect(balance.outstanding).toBe(600000);
    // Only the past-due charge's remaining 300000 counts toward overdue — the future charge isn't due yet.
    expect(balance.overdue).toBe(300000);
  });

  it('findOne() lazily flips a past-due PENDING charge to OVERDUE, persisted in the database', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('OVERDUE', 200000);
    const charge = await tuitionChargeService.create({ studentId, enrollmentId, billingPeriod: '2026-06', amount: 200000, dueDate: '2026-06-01T00:00:00.000Z' } as never);

    const result = await tuitionChargeService.findOne(charge.id);
    expect(result.status).toBe('OVERDUE');

    const persisted = await prisma.tuitionCharge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(persisted.status).toBe('OVERDUE');
  });
});
