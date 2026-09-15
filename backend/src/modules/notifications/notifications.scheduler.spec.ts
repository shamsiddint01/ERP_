import { describe, expect, it, vi } from 'vitest';
import { NotificationsScheduler } from './notifications.scheduler.js';

function createPrismaMock(overrides: Record<string, Record<string, unknown>> = {}) {
  return {
    inventoryStock: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    expense: { findMany: vi.fn().mockResolvedValue([]) },
    payroll: { findMany: vi.fn().mockResolvedValue([]) },
    tuitionCharge: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides.tuitionCharge,
    },
    exam: {
      findMany: vi.fn().mockResolvedValue([]),
      ...overrides.exam,
    },
  };
}

function createScheduler(prisma: ReturnType<typeof createPrismaMock>) {
  const notifications = { notifyByPermission: vi.fn().mockResolvedValue(1) };
  return { scheduler: new NotificationsScheduler(prisma as never, notifications as never), notifications };
}

function fakeCharge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'charge1',
    billingPeriod: '2026-09',
    netAmount: '500000',
    dueDate: new Date('2026-09-15'),
    status: 'PENDING',
    student: { fullName: 'Test Student' },
    allocations: [],
    ...overrides,
  };
}

describe('NotificationsScheduler — tuition scans (Phase G)', () => {
  it('scanTuitionDue notifies for a charge due within the reminder window', async () => {
    const prisma = createPrismaMock({ tuitionCharge: { findMany: vi.fn().mockResolvedValue([fakeCharge()]) } });
    const { scheduler, notifications } = createScheduler(prisma);

    const summary = await scheduler.runDailyScans();

    expect(summary.tuitionDue).toBe(1);
    expect(notifications.notifyByPermission).toHaveBeenCalledWith('tuition', 'VIEW', expect.objectContaining({ type: 'TUITION_DUE' }));
  });

  it('scanOverdueTuition flips a PENDING charge to OVERDUE and notifies', async () => {
    const findMany = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([fakeCharge({ status: 'PENDING' })]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrismaMock({ tuitionCharge: { findMany, updateMany } });
    const { scheduler, notifications } = createScheduler(prisma);

    const summary = await scheduler.runDailyScans();

    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'charge1', status: 'PENDING' }, data: { status: 'OVERDUE' } });
    expect(summary.overdueTuition).toBe(1);
    expect(notifications.notifyByPermission).toHaveBeenCalledWith('tuition', 'VIEW', expect.objectContaining({ type: 'TUITION_OVERDUE', severity: 'CRITICAL' }));
  });

  it('scanOverdueTuition reports the outstanding balance, not the full netAmount, for a partially-paid overdue charge', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([fakeCharge({ status: 'PARTIALLY_PAID', netAmount: '500000', allocations: [{ amount: '300000' }] })]);
    const prisma = createPrismaMock({ tuitionCharge: { findMany } });
    const { scheduler, notifications } = createScheduler(prisma);

    await scheduler.runDailyScans();

    expect(notifications.notifyByPermission).toHaveBeenCalledWith(
      'tuition',
      'VIEW',
      expect.objectContaining({ message: expect.stringContaining('200,000.00') }),
    );
    expect(notifications.notifyByPermission).not.toHaveBeenCalledWith('tuition', 'VIEW', expect.objectContaining({ message: expect.stringContaining('500,000.00') }));
  });

  it('does not re-flip a charge that is already OVERDUE, but still notifies (dedup handled by NotificationsService itself)', async () => {
    const findMany = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([fakeCharge({ status: 'OVERDUE' })]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrismaMock({ tuitionCharge: { findMany, updateMany } });
    const { scheduler } = createScheduler(prisma);

    await scheduler.runDailyScans();

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('never scans CANCELLED or PAID charges for either tuition scan', async () => {
    const dueFindMany = vi.fn().mockResolvedValue([]);
    const prisma = createPrismaMock({ tuitionCharge: { findMany: dueFindMany } });
    const { scheduler } = createScheduler(prisma);

    await scheduler.runDailyScans();

    for (const call of dueFindMany.mock.calls) {
      const statusFilter = (call[0] as { where: { status: { in?: string[] } | string } }).where.status;
      const statuses = typeof statusFilter === 'string' ? [statusFilter] : (statusFilter.in ?? []);
      expect(statuses).not.toContain('CANCELLED');
      expect(statuses).not.toContain('PAID');
    }
  });
});

describe('NotificationsScheduler — upcoming exam scan (Phase H)', () => {
  function fakeExam(overrides: Record<string, unknown> = {}) {
    return { id: 'exam1', title: 'Midterm Test', date: new Date('2026-09-15'), group: { name: 'IELTS Weekend' }, ...overrides };
  }

  it('scanUpcomingExams notifies for a SCHEDULED exam within the reminder window', async () => {
    const prisma = createPrismaMock({ exam: { findMany: vi.fn().mockResolvedValue([fakeExam()]) } });
    const { scheduler, notifications } = createScheduler(prisma);

    const summary = await scheduler.runDailyScans();

    expect(summary.upcomingExams).toBe(1);
    expect(notifications.notifyByPermission).toHaveBeenCalledWith('exams', 'VIEW', expect.objectContaining({ type: 'EXAM_UPCOMING', referenceId: 'exam1' }));
  });

  it('only ever queries for SCHEDULED exams (never COMPLETED/CANCELLED)', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = createPrismaMock({ exam: { findMany } });
    const { scheduler } = createScheduler(prisma);

    await scheduler.runDailyScans();

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'SCHEDULED' }) }));
  });
});
