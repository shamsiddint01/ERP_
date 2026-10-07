import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { currentPeriod, periodRange, SalariesService } from './salaries.service.js';

const allocation = (amount: string, groupId: string, teacherEmployeeId: string) => ({
  amount,
  tuitionCharge: { enrollment: { group: { id: groupId, name: `Group ${groupId}`, teacherEmployeeId } } },
});

function createPrisma(opts: {
  allocations?: ReturnType<typeof allocation>[];
  paid?: { teacherEmployeeId: string; _sum: { amount: string } }[];
  profiles?: { id: string; employeeId: string; status: string; salaryPercent: string | null; employee: { id: string; fullName: string; employeeCode: string } }[];
  user?: unknown;
} = {}) {
  const profiles = opts.profiles ?? [
    { id: 'tp1', employeeId: 'emp1', status: 'ACTIVE', salaryPercent: '40', employee: { id: 'emp1', fullName: 'Sarvinoz', employeeCode: 'T1' } },
    { id: 'tp2', employeeId: 'emp2', status: 'ACTIVE', salaryPercent: null, employee: { id: 'emp2', fullName: 'Jahongir', employeeCode: 'T2' } },
  ];
  return {
    tuitionAllocation: { findMany: vi.fn().mockResolvedValue(opts.allocations ?? []) },
    teacherSalaryPayment: {
      groupBy: vi.fn().mockResolvedValue(opts.paid ?? []),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pay1', ...data })),
    },
    teacherProfile: {
      findMany: vi.fn().mockResolvedValue(profiles),
      findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(profiles.find((p) => p.employeeId === where.employeeId) ?? null)),
    },
    user: { findUnique: vi.fn().mockResolvedValue(opts.user ?? null) },
  };
}

const service = (prisma: ReturnType<typeof createPrisma>) => new SalariesService(prisma as never, new AuditEntityRegistryService());

describe('salary periods', () => {
  it('a month is a Tashkent calendar month', () => {
    const { start, end } = periodRange('2026-10');
    expect(start.toISOString()).toBe('2026-09-30T19:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T19:00:00.000Z');
    expect(periodRange('2026-12').end.toISOString()).toBe('2026-12-31T19:00:00.000Z');
  });

  it('the current period follows Tashkent time, not UTC', () => {
    expect(currentPeriod(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11');
  });
});

describe('SalariesService.overview', () => {
  it('earned = salaryPercent % of what the teacher\'s groups collected; remaining = earned - paid', async () => {
    const prisma = createPrisma({
      allocations: [allocation('600000', 'g1', 'emp1'), allocation('400000', 'g1', 'emp1'), allocation('500000', 'g2', 'emp1'), allocation('300000', 'g3', 'emp2')],
      paid: [{ teacherEmployeeId: 'emp1', _sum: { amount: '100000' } }],
    });
    const result = await service(prisma).overview('2026-10');
    const sarvinoz = result.items.find((i) => i.teacherEmployeeId === 'emp1')!;
    expect(sarvinoz).toMatchObject({ percent: 40, collected: 1500000, earned: 600000, paid: 100000, remaining: 500000 });
    expect(sarvinoz.groups).toEqual(expect.arrayContaining([{ groupId: 'g1', groupName: 'Group g1', collected: 1000000 }]));
    // No % set yet → nothing earned (the admin sets it on the teacher).
    expect(result.items.find((i) => i.teacherEmployeeId === 'emp2')).toMatchObject({ percent: null, collected: 300000, earned: 0 });
    expect(result.totals).toMatchObject({ collected: 1800000, earned: 600000 });
  });

  it('only counts COMPLETED payments received inside the month', async () => {
    const prisma = createPrisma();
    await service(prisma).overview('2026-10');
    const where = prisma.tuitionAllocation.findMany.mock.calls[0][0].where;
    expect(where.payment).toEqual({ status: 'COMPLETED', paidAt: { gte: periodRange('2026-10').start, lt: periodRange('2026-10').end } });
  });
});

describe('SalariesService payouts', () => {
  it('records a payout up to what is still owed', async () => {
    const prisma = createPrisma({ allocations: [allocation('1000000', 'g1', 'emp1')] });
    await service(prisma).recordPayment({ teacherEmployeeId: 'emp1', period: '2026-10', amount: 400000 }, 'admin1');
    expect(prisma.teacherSalaryPayment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 400000, period: '2026-10', recordedByUserId: 'admin1' }) });
  });

  it('refuses to pay more than remains for the month', async () => {
    const prisma = createPrisma({ allocations: [allocation('1000000', 'g1', 'emp1')], paid: [{ teacherEmployeeId: 'emp1', _sum: { amount: '300000' } }] });
    await expect(service(prisma).recordPayment({ teacherEmployeeId: 'emp1', period: '2026-10', amount: 200000 }, 'admin1')).rejects.toThrow(BadRequestException);
  });
});

describe('SalariesService.mine', () => {
  it('refuses a user who is not a teacher', async () => {
    const prisma = createPrisma({ user: { employee: null } });
    await expect(service(prisma).mine('u1')).rejects.toThrow(ForbiddenException);
  });

  it("returns the caller's own month", async () => {
    const prisma = createPrisma({ user: { employee: { id: 'emp1', teacherProfile: { id: 'tp1' } } }, allocations: [allocation('500000', 'g1', 'emp1')] });
    const result = await service(prisma).mine('u1', '2026-10');
    expect(result).toMatchObject({ teacherEmployeeId: 'emp1', period: '2026-10', earned: 200000 });
    expect(result.history).toHaveLength(6);
  });
});
