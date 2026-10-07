import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { TuitionChargeService } from './tuition-charge.service.js';

function fakeEnrollment(overrides: Record<string, unknown> = {}) {
  return { id: 'enr1', studentId: 'student1', status: 'ACTIVE', agreedTuition: '500', ...overrides };
}

function fakeStudent(overrides: Record<string, unknown> = {}) {
  return { id: 'student1', fullName: 'Test Student', ...overrides };
}

function createTx(overrides: Record<string, unknown> = {}) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    tuitionCharge: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'charge1', status: 'PENDING', ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn(),
      ...(overrides.tuitionCharge as object),
    },
    studentDiscount: { findMany: vi.fn().mockResolvedValue([]), ...(overrides.studentDiscount as object) },
  };
}

function createService(opts: { enrollment?: unknown; student?: unknown; tx?: ReturnType<typeof createTx>; chargeFindUnique?: unknown } = {}) {
  const tx = opts.tx ?? createTx();
  // NB: `??` would treat an explicitly-passed `null` (simulating "not found")
  // as absent and fall back to the default fixture — use `in` so tests can
  // actually assert the not-found path.
  const enrollment = 'enrollment' in opts ? opts.enrollment : fakeEnrollment();
  const student = 'student' in opts ? opts.student : fakeStudent();
  const prisma = {
    enrollment: { findUnique: vi.fn().mockResolvedValue(enrollment) },
    student: { findUnique: vi.fn().mockResolvedValue(student) },
    tuitionCharge: {
      findUnique: vi.fn().mockResolvedValue(opts.chargeFindUnique),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...(opts.chargeFindUnique as object), ...data })),
    },
    $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(tx)),
  };
  const registry = new AuditEntityRegistryService();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new TuitionChargeService(prisma as any, registry);
  return { service, prisma, tx };
}

const baseDto = { studentId: 'student1', enrollmentId: 'enr1', billingPeriod: '2026-09', dueDate: '2026-09-30T00:00:00.000Z' };

describe('TuitionChargeService.create', () => {
  it('creates a charge defaulting amount from enrollment.agreedTuition, with no discount', async () => {
    const { service } = createService();
    const charge = await service.create(baseDto as never);

    expect(charge).toMatchObject({ amount: 500, discountAmount: 0, netAmount: 500, studentId: 'student1', enrollmentId: 'enr1' });
  });

  it('throws NotFoundException when the enrollment does not exist', async () => {
    const { service } = createService({ enrollment: null });
    await expect(service.create(baseDto as never)).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when the enrollment does not belong to the given student', async () => {
    const { service } = createService({ enrollment: fakeEnrollment({ studentId: 'someone-else' }) });
    await expect(service.create(baseDto as never)).rejects.toThrow(BadRequestException);
  });

  it('throws ConflictException when billing a cancelled enrollment', async () => {
    const { service } = createService({ enrollment: fakeEnrollment({ status: 'CANCELLED' }) });
    await expect(service.create(baseDto as never)).rejects.toThrow(ConflictException);
  });

  it('throws NotFoundException when the student does not exist', async () => {
    const { service } = createService({ student: null });
    await expect(service.create(baseDto as never)).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when no amount is given and the enrollment has no agreedTuition', async () => {
    const { service } = createService({ enrollment: fakeEnrollment({ agreedTuition: null }) });
    await expect(service.create(baseDto as never)).rejects.toThrow(BadRequestException);
  });

  it('uses an explicit amount over the enrollment default', async () => {
    const { service } = createService();
    const charge = await service.create({ ...baseDto, amount: 750 } as never);
    expect(charge).toMatchObject({ amount: 750, netAmount: 750 });
  });

  it('rejects duplicate billing for the same enrollment + billingPeriod', async () => {
    const tx = createTx({ tuitionCharge: { findFirst: vi.fn().mockResolvedValue({ id: 'existing' }) } });
    const { service } = createService({ tx });
    await expect(service.create(baseDto as never)).rejects.toThrow(ConflictException);
  });

  it('allows duplicate billing when allowDuplicate is set, bypassing the findFirst check entirely', async () => {
    const tx = createTx({ tuitionCharge: { findFirst: vi.fn().mockResolvedValue({ id: 'existing' }) } });
    const { service } = createService({ tx });
    const charge = await service.create({ ...baseDto, allowDuplicate: true } as never);
    expect(charge).toMatchObject({ netAmount: 500 });
    expect(tx.tuitionCharge.findFirst).not.toHaveBeenCalled();
  });

  it('takes a transaction-scoped advisory lock keyed on enrollment + billingPeriod before checking duplicates', async () => {
    const tx = createTx();
    const { service } = createService({ tx });
    await service.create(baseDto as never);
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('applies a flat StudentDiscount grant, reducing netAmount', async () => {
    const tx = createTx({ studentDiscount: { findMany: vi.fn().mockResolvedValue([{ discount: { isActive: true, type: 'FIXED', value: '100' } }]) } });
    const { service } = createService({ tx });
    const charge = await service.create(baseDto as never);

    expect(charge).toMatchObject({ amount: 500, discountAmount: 100, netAmount: 400 });
  });

  it('applies a PERCENTAGE StudentDiscount grant as a % of amount', async () => {
    const tx = createTx({ studentDiscount: { findMany: vi.fn().mockResolvedValue([{ discount: { isActive: true, type: 'PERCENTAGE', value: '20' } }]) } });
    const { service } = createService({ tx });
    const charge = await service.create(baseDto as never);
    expect(charge).toMatchObject({ discountAmount: 100, netAmount: 400 });
  });

  it('rounds a PERCENTAGE discount to 2 decimal places instead of leaving a sub-cent remainder', async () => {
    const tx = createTx({ studentDiscount: { findMany: vi.fn().mockResolvedValue([{ discount: { isActive: true, type: 'PERCENTAGE', value: '33.33' } }]) } });
    const { service } = createService({ tx });
    // 333333 * 33.33 / 100 = 111099.8889 unrounded — must come out as 111099.89, and netAmount must be the exact 2dp complement.
    const charge = await service.create({ ...baseDto, amount: 333333 } as never);
    expect(charge).toMatchObject({ discountAmount: 111099.89, netAmount: 222233.11 });
  });

  it('clamps a stack of discounts so netAmount can never go negative', async () => {
    const tx = createTx({
      studentDiscount: {
        findMany: vi.fn().mockResolvedValue([
          { discount: { isActive: true, type: 'FIXED', value: '400' } },
          { discount: { isActive: true, type: 'FIXED', value: '400' } },
        ]),
      },
    });
    const { service } = createService({ tx });
    const charge = await service.create(baseDto as never);
    expect(charge).toMatchObject({ discountAmount: 500, netAmount: 0 });
  });

  it('ignores a StudentDiscount grant whose underlying Discount catalog entry has since been deactivated', async () => {
    const tx = createTx({ studentDiscount: { findMany: vi.fn().mockResolvedValue([{ discount: { isActive: false, type: 'FIXED', value: '100' } }]) } });
    const { service } = createService({ tx });
    const charge = await service.create(baseDto as never);
    expect(charge).toMatchObject({ discountAmount: 0, netAmount: 500 });
  });

});

describe('TuitionChargeService.update', () => {
  it('refuses to edit a CANCELLED charge', async () => {
    const { service } = createService({ chargeFindUnique: { id: 'charge1', status: 'CANCELLED', dueDate: new Date(Date.now() + 86_400_000) } });
    await expect(service.update('charge1', { description: 'x' } as never)).rejects.toThrow(ConflictException);
  });

  it('only writes dueDate/description, never touching amount/discountAmount/netAmount', async () => {
    const { service, prisma } = createService({ chargeFindUnique: { id: 'charge1', status: 'PENDING', dueDate: new Date(Date.now() + 86_400_000) } });
    await service.update('charge1', { description: 'updated note' } as never);
    expect(prisma.tuitionCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'charge1' }, data: { dueDate: undefined, description: 'updated note' } }),
    );
  });
});

describe('TuitionChargeService.cancel', () => {
  function createCancelService(charge: Record<string, unknown>) {
    const tx = createTx();
    tx.tuitionCharge.findUniqueOrThrow = vi.fn().mockResolvedValue({ ...charge, status: 'CANCELLED' });
    const prisma = {
      tuitionCharge: { findUnique: vi.fn().mockResolvedValue(charge) },
      $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const registry = new AuditEntityRegistryService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new TuitionChargeService(prisma as any, registry);
    return { service, tx };
  }

  it('refuses to cancel a charge that already has allocations', async () => {
    const { service } = createCancelService({ id: 'charge1', status: 'PENDING', netAmount: '500', student: { fullName: 'X' }, allocations: [{ id: 'a1' }] });
    await expect(service.cancel('charge1')).rejects.toThrow(ConflictException);
  });

  it('refuses to cancel an already-cancelled charge', async () => {
    const { service } = createCancelService({ id: 'charge1', status: 'CANCELLED', netAmount: '500', student: { fullName: 'X' }, allocations: [] });
    await expect(service.cancel('charge1')).rejects.toThrow(ConflictException);
  });

  it('throws NotFoundException for a non-existent charge', async () => {
    const tx = createTx();
    const prisma = { tuitionCharge: { findUnique: vi.fn().mockResolvedValue(null) }, $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(tx)) };
    const registry = new AuditEntityRegistryService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const freshService = new TuitionChargeService(prisma as any, registry);
    await expect(freshService.cancel('missing')).rejects.toThrow(NotFoundException);
  });


  it('marks the charge CANCELLED via a status-guarded update', async () => {
    const { service, tx } = createCancelService({ id: 'charge1', status: 'PENDING', netAmount: '500', allocations: [] });
    const result = await service.cancel('charge1');
    expect(tx.tuitionCharge.updateMany).toHaveBeenCalledWith({ where: { id: 'charge1', status: 'PENDING' }, data: { status: 'CANCELLED' } });
    expect(result).toMatchObject({ status: 'CANCELLED' });
  });

  it('throws ConflictException on a concurrent status change (CAS failure)', async () => {
    const tx = createTx();
    tx.tuitionCharge.updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const charge = { id: 'charge1', status: 'PENDING', netAmount: '500', student: { fullName: 'X' }, allocations: [] };
    const prisma = { tuitionCharge: { findUnique: vi.fn().mockResolvedValue(charge) }, $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(tx)) };
    const registry = new AuditEntityRegistryService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new TuitionChargeService(prisma as any, registry);
    await expect(service.cancel('charge1')).rejects.toThrow(ConflictException);
  });
});

describe('TuitionChargeService — lazy overdue check', () => {
  it('flips a PENDING charge past its dueDate to OVERDUE on findOne()', async () => {
    const charge = { id: 'charge1', status: 'PENDING', dueDate: new Date(Date.now() - 86_400_000) };
    const { service, prisma } = createService({ chargeFindUnique: charge });
    const result = await service.findOne('charge1');
    expect(result).toMatchObject({ status: 'OVERDUE' });
    expect(prisma.tuitionCharge.update).toHaveBeenCalledWith({ where: { id: 'charge1' }, data: { status: 'OVERDUE' } });
  });

  it('leaves a PAID charge alone even when past its dueDate', async () => {
    const charge = { id: 'charge1', status: 'PAID', dueDate: new Date(Date.now() - 86_400_000) };
    const { service, prisma } = createService({ chargeFindUnique: charge });
    const result = await service.findOne('charge1');
    expect(result).toMatchObject({ status: 'PAID' });
    expect(prisma.tuitionCharge.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for a missing charge', async () => {
    const { service } = createService({ chargeFindUnique: null });
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('TuitionChargeService.findAll — two shown states', () => {
  async function whereFor(query: Record<string, unknown>) {
    const { service, prisma } = createService();
    const findMany = vi.fn().mockResolvedValue([]);
    Object.assign(prisma.tuitionCharge, { findMany, count: vi.fn().mockResolvedValue(0) });
    await service.findAll(query);
    return findMany.mock.calls[0][0].where;
  }

  it("To'langan = fully paid; To'lanmagan = pending, partly paid or overdue", async () => {
    expect((await whereFor({ paymentState: 'PAID' })).status).toBe('PAID');
    expect((await whereFor({ paymentState: 'UNPAID' })).status).toEqual({ in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] });
  });

  it('hides cancelled charges unless a status is asked for explicitly', async () => {
    expect((await whereFor({})).status).toEqual({ not: 'CANCELLED' });
    expect((await whereFor({ status: 'CANCELLED' })).status).toBe('CANCELLED');
  });
});
