import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PayrollCalculationService } from './payroll-calculation.service.js';

function fakePayroll(overrides: Partial<{ status: string }> = {}) {
  return {
    id: 'payroll1',
    status: overrides.status ?? 'DRAFT',
    employeeId: 'emp1',
    period: { periodStart: new Date('2026-09-01T00:00:00.000Z'), periodEnd: new Date('2026-09-30T00:00:00.000Z') },
    employee: { fullName: 'Aziz Karimov', deletedAt: null, hireDate: new Date('2026-01-01T00:00:00.000Z') },
  };
}

function fakeCompensation() {
  return { id: 'comp1', baseSalary: '10000000', salaryType: 'MONTHLY', overtimeRate: null };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  const txStub = {
    payroll: {
      findUnique: vi.fn().mockResolvedValue(fakePayroll()),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'payroll1', ...data })),
    },
    employeeCompensation: { findFirst: vi.fn().mockResolvedValue(fakeCompensation()) },
    attendanceRecord: { findMany: vi.fn().mockResolvedValue([]) },
    payrollLine: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
  return { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)), __tx: txStub };
}

describe('PayrollCalculationService', () => {
  it('rejects calculating a payroll that is not DRAFT or CALCULATED', async () => {
    const prisma = createPrismaMock({ payroll: { findUnique: vi.fn().mockResolvedValue(fakePayroll({ status: 'APPROVED' })) } });
    const service = new PayrollCalculationService(prisma as never);

    await expect(service.calculate('payroll1')).rejects.toThrow(ConflictException);
  });

  it('rejects calculating payroll for a terminated (soft-deleted) employee', async () => {
    const payroll = { ...fakePayroll(), employee: { ...fakePayroll().employee, deletedAt: new Date() } };
    const prisma = createPrismaMock({ payroll: { findUnique: vi.fn().mockResolvedValue(payroll) } });
    const service = new PayrollCalculationService(prisma as never);

    await expect(service.calculate('payroll1')).rejects.toThrow(BadRequestException);
  });

  it('rejects when the employee was hired after the period ended', async () => {
    const payroll = { ...fakePayroll(), employee: { ...fakePayroll().employee, hireDate: new Date('2026-10-01T00:00:00.000Z') } };
    const prisma = createPrismaMock({ payroll: { findUnique: vi.fn().mockResolvedValue(payroll) } });
    const service = new PayrollCalculationService(prisma as never);

    await expect(service.calculate('payroll1')).rejects.toThrow(BadRequestException);
  });

  it('rejects when no compensation record covers the period', async () => {
    const prisma = createPrismaMock({ employeeCompensation: { findFirst: vi.fn().mockResolvedValue(null) } });
    const service = new PayrollCalculationService(prisma as never);

    await expect(service.calculate('payroll1')).rejects.toThrow(BadRequestException);
  });

  it('rejects when existing deductions exceed the computed gross salary', async () => {
    const prisma = createPrismaMock({
      payrollLine: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([{ type: 'DEDUCTION', amount: '99999999' }]),
      },
    });
    const service = new PayrollCalculationService(prisma as never);

    await expect(service.calculate('payroll1')).rejects.toThrow(BadRequestException);
  });

  it('replaces only BASE/OVERTIME lines, preserving manually-added BONUS/DEDUCTION lines', async () => {
    const prisma = createPrismaMock({
      payrollLine: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([
          { type: 'BASE', amount: '10000000' },
          { type: 'BONUS', amount: '500000' },
          { type: 'DEDUCTION', amount: '300000' },
        ]),
      },
    });
    const service = new PayrollCalculationService(prisma as never);

    const result = await service.calculate('payroll1');

    expect(prisma.__tx.payrollLine.deleteMany).toHaveBeenCalledWith({ where: { payrollId: 'payroll1', type: { in: ['BASE', 'OVERTIME'] } } });
    expect(result).toMatchObject({ baseAmount: 10000000, bonusAmount: 500000, deductionAmount: 300000, grossSalary: 10500000, netSalary: 10200000, status: 'CALCULATED' });
  });

  it('throws NotFoundException for a missing payroll', async () => {
    const prisma = createPrismaMock({ payroll: { findUnique: vi.fn().mockResolvedValue(null) } });
    const service = new PayrollCalculationService(prisma as never);

    await expect(service.calculate('missing')).rejects.toThrow(NotFoundException);
  });
});
