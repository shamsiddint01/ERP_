import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LessonGenerationService } from './lesson-generation.service.js';

/** 2026-09-07 is a real Monday (verified via Date.UTC) — chosen so the first generated date equals startDate itself, keeping the expected dates in these tests trivial to eyeball. */
function fakeSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched1',
    groupId: 'group1',
    teacherEmployeeId: 'emp1',
    classroomId: 'room1',
    branchId: 'branch1',
    dayOfWeek: 'MONDAY',
    startTime: '18:00',
    endTime: '19:30',
    startDate: new Date('2026-09-07T00:00:00.000Z'),
    endDate: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    schedule: { findUnique: vi.fn().mockResolvedValue(fakeSchedule()), ...(overrides.schedule as Record<string, unknown>) },
    lesson: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      ...(overrides.lesson as Record<string, unknown>),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new LessonGenerationService(prisma as never);
}

describe('LessonGenerationService', () => {
  it('throws NotFoundException for a non-existent schedule', async () => {
    const prisma = createPrismaMock({ schedule: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(createService(prisma).generateForSchedule('missing', {})).rejects.toThrow(NotFoundException);
  });

  it('refuses to generate for a PAUSED schedule', async () => {
    const prisma = createPrismaMock({ schedule: { findUnique: vi.fn().mockResolvedValue(fakeSchedule({ status: 'PAUSED' })) } });
    await expect(createService(prisma).generateForSchedule('sched1', {})).rejects.toThrow(ConflictException);
  });

  it('refuses to generate for a CANCELLED schedule', async () => {
    const prisma = createPrismaMock({ schedule: { findUnique: vi.fn().mockResolvedValue(fakeSchedule({ status: 'CANCELLED' })) } });
    await expect(createService(prisma).generateForSchedule('sched1', {})).rejects.toThrow(ConflictException);
  });

  it('generates one Lesson per matching weekday across an explicit date range, at the schedule times', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 3 });
    const prisma = createPrismaMock({ lesson: { createMany } });
    await createService(prisma).generateForSchedule('sched1', { fromDate: '2026-09-07', toDate: '2026-09-21' });

    const rows = createMany.mock.calls[0][0].data as Array<{ scheduledStart: Date; scheduledEnd: Date }>;
    expect(rows).toHaveLength(3); // Sep 7, 14, 21 — all Mondays
    expect(rows[0].scheduledStart.toISOString()).toBe('2026-09-07T18:00:00.000Z');
    expect(rows[0].scheduledEnd.toISOString()).toBe('2026-09-07T19:30:00.000Z');
    expect(rows[1].scheduledStart.toISOString()).toBe('2026-09-14T18:00:00.000Z');
    expect(rows[2].scheduledStart.toISOString()).toBe('2026-09-21T18:00:00.000Z');
  });

  it('inherits group/teacher/classroom/branch straight from the schedule on every generated row', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrismaMock({ lesson: { createMany } });
    await createService(prisma).generateForSchedule('sched1', { fromDate: '2026-09-07', toDate: '2026-09-07' });

    const rows = createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ groupId: 'group1', scheduleId: 'sched1', teacherEmployeeId: 'emp1', classroomId: 'room1', branchId: 'branch1' });
  });

  it('never generates before the schedule\'s own startDate, even if fromDate is earlier', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrismaMock({ lesson: { createMany } });
    await createService(prisma).generateForSchedule('sched1', { fromDate: '2026-08-01', toDate: '2026-09-07' });

    const rows = createMany.mock.calls[0][0].data as Array<{ scheduledStart: Date }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].scheduledStart.toISOString()).toBe('2026-09-07T18:00:00.000Z');
  });

  it("never generates past the schedule's own endDate, even if toDate is later", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = createPrismaMock({
      schedule: { findUnique: vi.fn().mockResolvedValue(fakeSchedule({ endDate: new Date('2026-09-14T00:00:00.000Z') })) },
      lesson: { createMany },
    });
    await createService(prisma).generateForSchedule('sched1', { fromDate: '2026-09-07', toDate: '2026-12-31' });

    const rows = createMany.mock.calls[0][0].data as Array<{ scheduledStart: Date }>;
    expect(rows).toHaveLength(2); // Sep 7 and Sep 14 only
  });

  it('calls createMany with skipDuplicates so re-running an overlapping range never duplicates rows', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 0 }); // everything already existed
    const prisma = createPrismaMock({ lesson: { createMany } });
    const result = await createService(prisma).generateForSchedule('sched1', { fromDate: '2026-09-07', toDate: '2026-09-21' });

    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(result.generatedCount).toBe(0);
    expect(result.skippedCount).toBe(3); // all 3 candidate dates were already there
  });

  it('reports generatedCount/skippedCount split correctly on a partial re-run', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 }); // 1 of 3 candidate dates was new
    const prisma = createPrismaMock({ lesson: { createMany } });
    const result = await createService(prisma).generateForSchedule('sched1', { fromDate: '2026-09-07', toDate: '2026-09-21' });

    expect(result.generatedCount).toBe(1);
    expect(result.skippedCount).toBe(2);
  });

  it('rejects a toDate before fromDate', async () => {
    const prisma = createPrismaMock();
    await expect(createService(prisma).generateForSchedule('sched1', { fromDate: '2026-09-21', toDate: '2026-09-07' })).rejects.toThrow(BadRequestException);
  });

  it('rejects an invalid fromDate', async () => {
    const prisma = createPrismaMock();
    await expect(createService(prisma).generateForSchedule('sched1', { fromDate: 'not-a-date' })).rejects.toThrow(BadRequestException);
  });

  it('rejects a range spanning more than the 52-week safety cap', async () => {
    const prisma = createPrismaMock();
    await expect(createService(prisma).generateForSchedule('sched1', { fromDate: '2026-09-07', toDate: '2028-09-07' })).rejects.toThrow(BadRequestException);
  });

  it('defaults to a ~12-week window when no toDate is given (inclusive of both endpoints, so 13 weekly occurrences)', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 13 });
    const prisma = createPrismaMock({ lesson: { createMany } });
    await createService(prisma).generateForSchedule('sched1', { fromDate: '2026-09-07' });

    const rows = createMany.mock.calls[0][0].data as unknown[];
    expect(rows).toHaveLength(13);
  });

  it('returns an empty result (no createMany call) when the range contains no matching weekday', async () => {
    const createMany = vi.fn();
    const prisma = createPrismaMock({ lesson: { createMany } });
    const result = await createService(prisma).generateForSchedule('sched1', { fromDate: '2026-09-08', toDate: '2026-09-13' }); // Tue-Sun, no Monday in range

    expect(createMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ generatedCount: 0, skippedCount: 0, lessons: [] });
  });
});
