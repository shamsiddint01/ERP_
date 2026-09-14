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

function fakeCompensation(overrides: Partial<{ salaryType: string; baseSalary: string }> = {}) {
  return { id: 'comp1', baseSalary: overrides.baseSalary ?? '10000000', salaryType: overrides.salaryType ?? 'MONTHLY', overtimeRate: null };
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
    teacherProfile: { findUnique: vi.fn().mockResolvedValue({ perLessonRate: '50000', perGroupRate: '300000' }) },
    lesson: { count: vi.fn().mockResolvedValue(0) },
    studentGroup: { count: vi.fn().mockResolvedValue(0) },
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

describe('PayrollCalculationService — Phase H teacher compensation', () => {
  it('PER_LESSON: computes baseAmount from real completed-lesson count x the TeacherProfile rate', async () => {
    const prisma = createPrismaMock({
      employeeCompensation: { findFirst: vi.fn().mockResolvedValue(fakeCompensation({ salaryType: 'PER_LESSON' })) },
      lesson: { count: vi.fn().mockResolvedValue(8) },
    });
    const service = new PayrollCalculationService(prisma as never);

    const result = await service.calculate('payroll1');

    expect(result).toMatchObject({ baseAmount: 400000 }); // 8 lessons x 50,000
  });

  it('PER_LESSON: only counts COMPLETED lessons in the period — the query itself excludes CANCELLED, never paying for them', async () => {
    const prisma = createPrismaMock({ employeeCompensation: { findFirst: vi.fn().mockResolvedValue(fakeCompensation({ salaryType: 'PER_LESSON' })) } });
    const service = new PayrollCalculationService(prisma as never);

    await service.calculate('payroll1');

    expect(prisma.__tx.lesson.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ teacherEmployeeId: 'emp1', status: 'COMPLETED' }) }),
    );
  });

  it('PER_GROUP: computes baseAmount from real active-group count x the TeacherProfile rate, scoped to ACTIVE groups overlapping the period', async () => {
    const prisma = createPrismaMock({
      employeeCompensation: { findFirst: vi.fn().mockResolvedValue(fakeCompensation({ salaryType: 'PER_GROUP' })) },
      studentGroup: { count: vi.fn().mockResolvedValue(2) },
    });
    const service = new PayrollCalculationService(prisma as never);

    const result = await service.calculate('payroll1');

    expect(result).toMatchObject({ baseAmount: 600000 }); // 2 groups x 300,000
    expect(prisma.__tx.studentGroup.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ teacherEmployeeId: 'emp1', status: 'ACTIVE' }) }));
  });

  it('MIXED: combines a prorated base with both lesson and group components', async () => {
    const prisma = createPrismaMock({
      employeeCompensation: { findFirst: vi.fn().mockResolvedValue(fakeCompensation({ salaryType: 'MIXED', baseSalary: '2200000' })) },
      lesson: { count: vi.fn().mockResolvedValue(5) },
      studentGroup: { count: vi.fn().mockResolvedValue(1) },
    });
    const service = new PayrollCalculationService(prisma as never);

    const result = await service.calculate('payroll1');

    // base 2,200,000 (no absence) + 5*50,000 lessons + 1*300,000 group = 2,750,000
    expect(result).toMatchObject({ baseAmount: 2750000 });
  });

  it('rejects PER_LESSON compensation for an employee with no TeacherProfile at all', async () => {
    const prisma = createPrismaMock({
      employeeCompensation: { findFirst: vi.fn().mockResolvedValue(fakeCompensation({ salaryType: 'PER_LESSON' })) },
      teacherProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const service = new PayrollCalculationService(prisma as never);

    await expect(service.calculate('payroll1')).rejects.toThrow(BadRequestException);
  });

  it('rejects PER_LESSON compensation when the TeacherProfile has no perLessonRate set', async () => {
    const prisma = createPrismaMock({
      employeeCompensation: { findFirst: vi.fn().mockResolvedValue(fakeCompensation({ salaryType: 'PER_LESSON' })) },
      teacherProfile: { findUnique: vi.fn().mockResolvedValue({ perLessonRate: null, perGroupRate: '300000' }) },
    });
    const service = new PayrollCalculationService(prisma as never);

    await expect(service.calculate('payroll1')).rejects.toThrow(BadRequestException);
  });

  it('rejects PER_GROUP compensation when the TeacherProfile has no perGroupRate set', async () => {
    const prisma = createPrismaMock({
      employeeCompensation: { findFirst: vi.fn().mockResolvedValue(fakeCompensation({ salaryType: 'PER_GROUP' })) },
      teacherProfile: { findUnique: vi.fn().mockResolvedValue({ perLessonRate: '50000', perGroupRate: null }) },
    });
    const service = new PayrollCalculationService(prisma as never);

    await expect(service.calculate('payroll1')).rejects.toThrow(BadRequestException);
  });

  it('rejects MIXED compensation when NEITHER perLessonRate nor perGroupRate is set', async () => {
    const prisma = createPrismaMock({
      employeeCompensation: { findFirst: vi.fn().mockResolvedValue(fakeCompensation({ salaryType: 'MIXED' })) },
      teacherProfile: { findUnique: vi.fn().mockResolvedValue({ perLessonRate: null, perGroupRate: null }) },
    });
    const service = new PayrollCalculationService(prisma as never);

    await expect(service.calculate('payroll1')).rejects.toThrow(BadRequestException);
  });

  it('MIXED is allowed with only ONE of the two rates set (the other contributes zero)', async () => {
    const prisma = createPrismaMock({
      employeeCompensation: { findFirst: vi.fn().mockResolvedValue(fakeCompensation({ salaryType: 'MIXED', baseSalary: '1000000' })) },
      teacherProfile: { findUnique: vi.fn().mockResolvedValue({ perLessonRate: '10000', perGroupRate: null }) },
      lesson: { count: vi.fn().mockResolvedValue(3) },
    });
    const service = new PayrollCalculationService(prisma as never);

    const result = await service.calculate('payroll1');

    expect(result).toMatchObject({ baseAmount: 1030000 }); // 1,000,000 + 3*10,000
  });

  it('never touches TeacherProfile/Lesson/StudentGroup for an ordinary MONTHLY employee', async () => {
    const prisma = createPrismaMock();
    const service = new PayrollCalculationService(prisma as never);

    await service.calculate('payroll1');

    expect(prisma.__tx.teacherProfile.findUnique).not.toHaveBeenCalled();
    expect(prisma.__tx.lesson.count).not.toHaveBeenCalled();
    expect(prisma.__tx.studentGroup.count).not.toHaveBeenCalled();
  });
});
