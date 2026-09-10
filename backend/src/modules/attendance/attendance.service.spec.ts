import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceService } from './attendance.service.js';

const WORK_SCHEDULE = { startTime: '09:00', endTime: '18:00', lateThresholdMinutes: 0 };

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    employee: { findUnique: vi.fn().mockResolvedValue({ id: 'emp1', deletedAt: null }) },
    attendanceRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'att1', workDate: new Date('2026-09-09'), employee: { fullName: 'Test Employee' }, ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'att1', workDate: new Date('2026-09-09'), employee: { fullName: 'Test Employee' }, ...data })),
      ...(overrides.attendanceRecord as Record<string, unknown>),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  const settingsService = { get: vi.fn().mockResolvedValue({ workScheduleSettings: WORK_SCHEDULE }) };
  const notifications = { notifyByPermission: vi.fn().mockResolvedValue(0) };
  const registry = { register: vi.fn() };
  return new AttendanceService(prisma as never, settingsService as never, notifications as never, registry as never);
}

describe('AttendanceService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-09-09 09:17 UTC — 17 minutes after the 09:00 schedule start.
    vi.setSystemTime(new Date('2026-09-09T09:17:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkIn', () => {
    it('creates a new record and computes late minutes past the scheduled start', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      const result = await service.checkIn({ employeeId: 'emp1' });

      expect(result).toMatchObject({ status: 'LATE', lateMinutes: 17 });
    });

    it('refuses a second check-in on the same day', async () => {
      const prisma = createPrismaMock({ attendanceRecord: { findUnique: vi.fn().mockResolvedValue({ id: 'att1', checkInAt: new Date() }) } });
      const service = createService(prisma);

      await expect(service.checkIn({ employeeId: 'emp1' })).rejects.toThrow(ConflictException);
    });

    it('fills in an existing check-in-less placeholder record instead of creating a duplicate', async () => {
      const prisma = createPrismaMock({
        attendanceRecord: { findUnique: vi.fn().mockResolvedValue({ id: 'att1', checkInAt: null, notes: null }) },
      });
      const service = createService(prisma);

      await service.checkIn({ employeeId: 'emp1' });

      expect(prisma.attendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'att1' } }));
      expect(prisma.attendanceRecord.create).not.toHaveBeenCalled();
    });
  });

  describe('checkOut', () => {
    it('refuses to check out without a prior check-in', async () => {
      const prisma = createPrismaMock({ attendanceRecord: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.checkOut({ employeeId: 'emp1' })).rejects.toThrow(BadRequestException);
    });

    it('refuses a second check-out on the same day', async () => {
      const prisma = createPrismaMock({
        attendanceRecord: {
          findUnique: vi.fn().mockResolvedValue({ id: 'att1', checkInAt: new Date('2026-09-09T09:17:00.000Z'), checkOutAt: new Date() }),
        },
      });
      const service = createService(prisma);

      await expect(service.checkOut({ employeeId: 'emp1' })).rejects.toThrow(ConflictException);
    });

    it('computes hoursWorked and overtime past the scheduled end', async () => {
      const checkInAt = new Date('2026-09-09T09:17:00.000Z');
      const prisma = createPrismaMock({
        attendanceRecord: { findUnique: vi.fn().mockResolvedValue({ id: 'att1', checkInAt, checkOutAt: null, notes: null }) },
      });
      const service = createService(prisma);

      // Move "now" to 19:30 — 90 minutes past the 18:00 scheduled end.
      vi.setSystemTime(new Date('2026-09-09T19:30:00.000Z'));

      const result = await service.checkOut({ employeeId: 'emp1' });

      expect(result).toMatchObject({ overtimeMinutes: 90 });
    });
  });

  describe('create', () => {
    it('rejects a manual entry where checkOutAt is not after checkInAt', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(
        service.create({ employeeId: 'emp1', workDate: '2026-09-09', checkInAt: '2026-09-09T10:00:00.000Z', checkOutAt: '2026-09-09T09:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('translates a unique-constraint violation into a clean ConflictException', async () => {
      const prisma = createPrismaMock({
        attendanceRecord: {
          create: vi.fn().mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
          ),
        },
      });
      const service = createService(prisma);

      await expect(service.create({ employeeId: 'emp1', workDate: '2026-09-09' })).rejects.toThrow(ConflictException);
    });
  });
});
