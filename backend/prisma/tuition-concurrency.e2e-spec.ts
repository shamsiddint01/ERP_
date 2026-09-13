import 'dotenv/config';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditEntityRegistryService } from '../src/shared/audit/audit-entity-registry.service.js';
import { ACCOUNT_CODES } from '../src/shared/finance/account-codes.constant.js';
import { FinanceLedgerService } from '../src/shared/finance/finance-ledger.service.js';
import { JournalService } from '../src/shared/finance/journal.service.js';
import { StudentFinanceService } from '../src/modules/tuition/student-finance.service.js';
import { TuitionAllocationService } from '../src/modules/tuition/tuition-allocation.service.js';
import { TuitionChargeService } from '../src/modules/tuition/tuition-charge.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Genuine concurrency + accounting-integrity coverage for Phase G — runs the
 * REAL TuitionChargeService/TuitionAllocationService/FinanceLedgerService
 * against the REAL dev Postgres (no mocks), firing truly parallel requests to
 * prove the transaction-scoped advisory locks actually serialize them, and
 * inspecting the real JournalEntry/JournalLine rows to prove Debit=Credit
 * holds for every posting. Every row is created under the `ZZCONG-` prefix
 * and removed in afterAll — including reversing the exact balance deltas our
 * own postings applied to the shared, real Chart-of-Accounts rows, so this
 * suite never leaves a permanent mark on Account.currentBalance.
 */
const prisma = new PrismaService();
const registry = new AuditEntityRegistryService();
const journal = new JournalService(prisma);
const financeLedger = new FinanceLedgerService(prisma, journal);
const tuitionChargeService = new TuitionChargeService(prisma, financeLedger, registry);
const tuitionAllocationService = new TuitionAllocationService(prisma);
const studentFinanceService = new StudentFinanceService(prisma);

const P = 'ZZCONG-';

// Mirrors JournalService's own DEBIT_NORMAL_CATEGORIES — used only to reverse
// the Account.currentBalance deltas our test postings applied, in afterAll.
const DEBIT_NORMAL_CATEGORIES = new Set(['ASSET', 'EXPENSE']);

let branchId: string;
let courseId: string;
let groupId: string;
let adminUserId: string;
const studentIds: string[] = [];
const enrollmentIds: string[] = [];
const paymentIds: string[] = [];
const journalReferenceIds: string[] = []; // chargeIds and paymentIds whose journal entries must be reversed+deleted

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

/** Mirrors PaymentsService.create's TUITION_CHARGE branch closely enough to exercise TuitionAllocationService for real: a COMPLETED payment referencing the student, with cash recognized via the same recordCustomerPayment used in production. */
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
    await financeLedger.recordCustomerPayment({ amount, method: 'CASH', paymentId: payment.id, paymentNumber, createdByUserId: adminUserId }, tx);
    paymentIds.push(payment.id);
    journalReferenceIds.push(payment.id);
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
  // Reverse every Account.currentBalance delta our test postings applied, so
  // this suite leaves the real, shared Chart of Accounts exactly as it found
  // it — but deliberately leave the JournalEntry/JournalLine rows themselves
  // in place, never deleted.
  //
  // This one is load-bearing, not a style choice: entryNumber generation
  // (generateDocumentNumber, shared by every JournalEntry/Payment/PO/etc. in
  // the app) derives the next number from a plain journalEntry.count() —
  // there is no real sequence behind it. Deleting rows out of the middle (or
  // top) of that count desyncs it from the actual max entry_number in the
  // table, and every subsequent posting anywhere in the app then collides on
  // a unique constraint and fails — permanently, until the gap is closed —
  // which is exactly what an earlier version of this cleanup did to the dev
  // database. The ledger is meant to be append-only anyway (the codebase's
  // own convention is to reverse a posting with a new entry, never delete
  // the original — see TuitionChargeService.cancel), so this suite honors
  // that: it posts real, correctly-balanced Dr=Cr entries under real
  // ZZCONG-tagged test references, and only cleans up their *balance*
  // footprint, leaving the entries themselves as harmless permanent history.
  if (journalReferenceIds.length > 0) {
    const entries = await prisma.journalEntry.findMany({
      where: { referenceId: { in: journalReferenceIds } },
      include: { lines: true },
    });
    const accountIds = [...new Set(entries.flatMap((e) => e.lines.map((l) => l.accountId)))];
    const accounts = await prisma.account.findMany({ where: { id: { in: accountIds } } });
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    for (const entry of entries) {
      for (const line of entry.lines) {
        const account = accountById.get(line.accountId)!;
        const isDebitNormal = DEBIT_NORMAL_CATEGORIES.has(account.category);
        const delta = isDebitNormal ? Number(line.debit) - Number(line.credit) : Number(line.credit) - Number(line.debit);
        await prisma.account.update({ where: { id: account.id }, data: { currentBalance: { decrement: delta } } });
      }
    }
  }

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
      tuitionChargeService.create(dto as never, adminUserId),
      tuitionChargeService.create(dto as never, adminUserId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ id: string }>[];
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    journalReferenceIds.push(fulfilled[0].value.id);

    const nonCancelledCount = await prisma.tuitionCharge.count({ where: { enrollmentId, billingPeriod: '2026-10', status: { not: 'CANCELLED' } } });
    expect(nonCancelledCount).toBe(1);
  });

  it('allowDuplicate explicitly overrides the duplicate check — a deliberate second bill for the same period is allowed', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('OVERRIDE', 500000);
    const dto = { studentId, enrollmentId, billingPeriod: '2026-11', amount: 500000, dueDate: '2026-11-05T00:00:00.000Z' };

    const first = await tuitionChargeService.create(dto as never, adminUserId);
    const second = await tuitionChargeService.create({ ...dto, allowDuplicate: true } as never, adminUserId);
    journalReferenceIds.push(first.id, second.id);

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
    const charge = await tuitionChargeService.create(
      { studentId, enrollmentId, billingPeriod: '2026-09', amount: 300000, dueDate: '2026-09-30T00:00:00.000Z' } as never,
      adminUserId,
    );
    journalReferenceIds.push(charge.id);
    // Fixture setup runs SEQUENTIALLY — only the allocate() calls below are
    // the concurrent operation under test. Creating these payments (hence
    // their journal entries) truly in parallel would race on the unrelated,
    // pre-existing count()-then-create() sequence numbering in
    // generateDocumentNumber (shared by JournalEntry/Payment/PO numbering
    // across the whole app, not something Phase G touches), which is a
    // separate, already-existing gap outside this phase's scope.
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
    const charge = await tuitionChargeService.create(
      { studentId, enrollmentId, billingPeriod: '2026-09', amount: 300000, dueDate: '2026-09-30T00:00:00.000Z' } as never,
      adminUserId,
    );
    journalReferenceIds.push(charge.id);
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
    // Sequential fixture setup — see the note in the first test of this
    // describe block (concurrent journal-entry-number generation across
    // unrelated charges would race on generateDocumentNumber, not on
    // anything Phase G is responsible for).
    const charges = [];
    for (const billingPeriod of ['2026-09', '2026-10', '2026-11']) {
      charges.push(await tuitionChargeService.create({ studentId, enrollmentId, billingPeriod, amount: 200000, dueDate: `${billingPeriod}-25T00:00:00.000Z` } as never, adminUserId));
    }
    journalReferenceIds.push(...charges.map((c) => c.id));
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

describe('Finance integration — Debit=Credit through the real ledger (Phase G, real Postgres, no mocks)', () => {
  it('billing a charge posts a balanced Dr Accounts Receivable / Cr Tuition Revenue entry', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('JOURNAL-BILL', 400000);
    const charge = await tuitionChargeService.create(
      { studentId, enrollmentId, billingPeriod: '2026-09', amount: 400000, dueDate: '2026-09-30T00:00:00.000Z' } as never,
      adminUserId,
    );
    journalReferenceIds.push(charge.id);

    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { referenceType: 'TUITION_CHARGE', referenceId: charge.id }, include: { lines: { include: { account: true } } } });
    expect(entry.lines).toHaveLength(2);
    const totalDebit = entry.lines.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = entry.lines.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(400000);

    const arLine = entry.lines.find((l) => l.account.code === ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)!;
    const revenueLine = entry.lines.find((l) => l.account.code === ACCOUNT_CODES.TUITION_REVENUE)!;
    expect(Number(arLine.debit)).toBe(400000);
    expect(Number(revenueLine.credit)).toBe(400000);
  });

  it('paying a tuition charge reuses recordCustomerPayment verbatim: Dr Cash / Cr Accounts Receivable, no separate tuition ledger method', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('JOURNAL-PAY', 250000);
    const charge = await tuitionChargeService.create(
      { studentId, enrollmentId, billingPeriod: '2026-09', amount: 250000, dueDate: '2026-09-30T00:00:00.000Z' } as never,
      adminUserId,
    );
    journalReferenceIds.push(charge.id);
    const paymentId = await createCompletedTuitionPayment(studentId, 250000);

    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { referenceType: 'PAYMENT', referenceId: paymentId }, include: { lines: { include: { account: true } } } });
    expect(entry.lines).toHaveLength(2);
    const cashLine = entry.lines.find((l) => l.account.code === ACCOUNT_CODES.CASH)!;
    const arLine = entry.lines.find((l) => l.account.code === ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)!;
    expect(Number(cashLine.debit)).toBe(250000);
    expect(Number(arLine.credit)).toBe(250000);
  });

  it('allocating a payment to a charge posts NO new journal entry — the cash was already recognized at payment time, allocation is pure bookkeeping', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('JOURNAL-ALLOC', 150000);
    const charge = await tuitionChargeService.create(
      { studentId, enrollmentId, billingPeriod: '2026-09', amount: 150000, dueDate: '2026-09-30T00:00:00.000Z' } as never,
      adminUserId,
    );
    journalReferenceIds.push(charge.id);
    const paymentId = await createCompletedTuitionPayment(studentId, 150000);

    const countBefore = await prisma.journalEntry.count();
    await tuitionAllocationService.allocate(paymentId, [{ tuitionChargeId: charge.id, amount: 150000 }], adminUserId);
    const countAfter = await prisma.journalEntry.count();

    expect(countAfter).toBe(countBefore);
  });

  it('cancelling an unallocated charge reverses the original entry: Dr Tuition Revenue / Cr Accounts Receivable', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('JOURNAL-CANCEL', 100000);
    const charge = await tuitionChargeService.create(
      { studentId, enrollmentId, billingPeriod: '2026-09', amount: 100000, dueDate: '2026-09-30T00:00:00.000Z' } as never,
      adminUserId,
    );
    journalReferenceIds.push(charge.id);

    await tuitionChargeService.cancel(charge.id, adminUserId);

    const entries = await prisma.journalEntry.findMany({ where: { referenceType: 'TUITION_CHARGE', referenceId: charge.id }, include: { lines: { include: { account: true } } }, orderBy: { createdAt: 'asc' } });
    expect(entries).toHaveLength(2); // original billing + reversal
    const reversal = entries[1];
    const revenueLine = reversal.lines.find((l) => l.account.code === ACCOUNT_CODES.TUITION_REVENUE)!;
    const arLine = reversal.lines.find((l) => l.account.code === ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)!;
    expect(Number(revenueLine.debit)).toBe(100000);
    expect(Number(arLine.credit)).toBe(100000);
  });

  it('refuses to cancel a charge that already has an allocation against it', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('JOURNAL-CANCEL-BLOCKED', 120000);
    const charge = await tuitionChargeService.create(
      { studentId, enrollmentId, billingPeriod: '2026-09', amount: 120000, dueDate: '2026-09-30T00:00:00.000Z' } as never,
      adminUserId,
    );
    journalReferenceIds.push(charge.id);
    const paymentId = await createCompletedTuitionPayment(studentId, 120000);
    await tuitionAllocationService.allocate(paymentId, [{ tuitionChargeId: charge.id, amount: 120000 }], adminUserId);

    await expect(tuitionChargeService.cancel(charge.id, adminUserId)).rejects.toThrow(ConflictException);
  });
});

describe('Student balance & lazy overdue (Phase G, real Postgres, no mocks)', () => {
  it('getBalance computes totalBilled/paid/outstanding/overdue purely from live TuitionCharge/TuitionAllocation rows', async () => {
    const { studentId, enrollmentId } = await makeStudentAndEnrollment('BALANCE', 500000);
    const pastDueCharge = await tuitionChargeService.create(
      { studentId, enrollmentId, billingPeriod: '2026-07', amount: 500000, dueDate: '2026-07-01T00:00:00.000Z' } as never,
      adminUserId,
    );
    const futureCharge = await tuitionChargeService.create(
      { studentId, enrollmentId, billingPeriod: '2026-12', amount: 300000, dueDate: '2026-12-31T00:00:00.000Z' } as never,
      adminUserId,
    );
    journalReferenceIds.push(pastDueCharge.id, futureCharge.id);
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
    const charge = await tuitionChargeService.create(
      { studentId, enrollmentId, billingPeriod: '2026-06', amount: 200000, dueDate: '2026-06-01T00:00:00.000Z' } as never,
      adminUserId,
    );
    journalReferenceIds.push(charge.id);

    const result = await tuitionChargeService.findOne(charge.id);
    expect(result.status).toBe('OVERDUE');

    const persisted = await prisma.tuitionCharge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(persisted.status).toBe('OVERDUE');
  });
});
