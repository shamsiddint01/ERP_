import { describe, expect, it } from 'vitest';
import {
  computeBaseAmount,
  computeOvertimeAmount,
  countStandardWorkingDays,
  resolveHourlyRate,
  resolveOvertimeRate,
  round2,
  summarizeAttendance,
} from './payroll-calculation.util.js';

describe('summarizeAttendance', () => {
  it('counts PRESENT and LATE as full worked days, HALF_DAY as half, ABSENT as unpaid', () => {
    const summary = summarizeAttendance([
      { status: 'PRESENT', hoursWorked: '8', overtimeMinutes: 0 },
      { status: 'LATE', hoursWorked: '7.5', overtimeMinutes: 0 },
      { status: 'HALF_DAY', hoursWorked: '4', overtimeMinutes: 0 },
      { status: 'ABSENT', hoursWorked: null, overtimeMinutes: 0 },
      { status: 'ON_LEAVE', hoursWorked: null, overtimeMinutes: 0 },
      { status: 'HOLIDAY', hoursWorked: null, overtimeMinutes: 0 },
    ] as never);

    expect(summary.workedDays).toBe(2.5);
    expect(summary.unpaidAbsenceDays).toBe(1);
    expect(summary.workedMinutes).toBe(8 * 60 + 7.5 * 60 + 4 * 60);
  });

  it('sums overtimeMinutes across all records regardless of status', () => {
    const summary = summarizeAttendance([
      { status: 'PRESENT', hoursWorked: '8', overtimeMinutes: 30 },
      { status: 'LATE', hoursWorked: '8', overtimeMinutes: 15 },
    ] as never);
    expect(summary.overtimeMinutes).toBe(45);
  });

  it('treats approved leave and holidays as neither worked nor unpaid-absent', () => {
    const summary = summarizeAttendance([
      { status: 'ON_LEAVE', hoursWorked: null, overtimeMinutes: 0 },
      { status: 'HOLIDAY', hoursWorked: null, overtimeMinutes: 0 },
    ] as never);
    expect(summary.workedDays).toBe(0);
    expect(summary.unpaidAbsenceDays).toBe(0);
  });
});

describe('countStandardWorkingDays', () => {
  it('counts only Mon-Fri in a calendar month', () => {
    // September 2026: 1st is a Tuesday, 30th is a Wednesday -> 22 weekdays.
    const count = countStandardWorkingDays(new Date('2026-09-01T00:00:00.000Z'), new Date('2026-09-30T00:00:00.000Z'));
    expect(count).toBe(22);
  });

  it('counts a single weekday as 1', () => {
    const count = countStandardWorkingDays(new Date('2026-09-01T00:00:00.000Z'), new Date('2026-09-01T00:00:00.000Z'));
    expect(count).toBe(1);
  });

  it('excludes a single weekend day', () => {
    // 2026-09-05 is a Saturday.
    const count = countStandardWorkingDays(new Date('2026-09-05T00:00:00.000Z'), new Date('2026-09-05T00:00:00.000Z'));
    expect(count).toBe(0);
  });
});

describe('resolveHourlyRate', () => {
  it('returns baseSalary directly for HOURLY', () => {
    expect(resolveHourlyRate({ baseSalary: 50000, salaryType: 'HOURLY', overtimeRate: null })).toBe(50000);
  });

  it('divides by 8 for DAILY', () => {
    expect(resolveHourlyRate({ baseSalary: 400000, salaryType: 'DAILY', overtimeRate: null })).toBe(50000);
  });

  it('divides by 176 standard monthly hours for MONTHLY', () => {
    const rate = resolveHourlyRate({ baseSalary: 17_600_000, salaryType: 'MONTHLY', overtimeRate: null });
    expect(rate).toBe(100_000);
  });
});

describe('resolveOvertimeRate', () => {
  it('uses the explicit overtimeRate when set', () => {
    expect(resolveOvertimeRate({ baseSalary: 10_000_000, salaryType: 'MONTHLY', overtimeRate: 75000 })).toBe(75000);
  });

  it('defaults to 1.5x the resolved hourly rate when overtimeRate is null', () => {
    const rate = resolveOvertimeRate({ baseSalary: 17_600_000, salaryType: 'MONTHLY', overtimeRate: null });
    expect(rate).toBe(round2(100_000 * 1.5));
  });
});

describe('computeBaseAmount', () => {
  it('MONTHLY: pays full base salary when there is no unpaid absence', () => {
    const amount = computeBaseAmount({ baseSalary: 10_000_000, salaryType: 'MONTHLY', overtimeRate: null }, 22, {
      workedDays: 22,
      workedMinutes: 0,
      overtimeMinutes: 0,
      unpaidAbsenceDays: 0,
    });
    expect(amount).toBe(10_000_000);
  });

  it('MONTHLY: prorates down for unpaid absence days', () => {
    const amount = computeBaseAmount({ baseSalary: 22_000_000, salaryType: 'MONTHLY', overtimeRate: null }, 22, {
      workedDays: 20,
      workedMinutes: 0,
      overtimeMinutes: 0,
      unpaidAbsenceDays: 2,
    });
    // 22 - 2 = 20 payable days out of 22 -> 22,000,000 * 20/22 = 20,000,000
    expect(amount).toBe(20_000_000);
  });

  it('MONTHLY: never goes negative even if unpaid absence somehow exceeds standard working days', () => {
    const amount = computeBaseAmount({ baseSalary: 10_000_000, salaryType: 'MONTHLY', overtimeRate: null }, 22, {
      workedDays: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
      unpaidAbsenceDays: 30,
    });
    expect(amount).toBe(0);
  });

  it('DAILY: multiplies the daily rate by worked days', () => {
    const amount = computeBaseAmount({ baseSalary: 500000, salaryType: 'DAILY', overtimeRate: null }, 22, {
      workedDays: 18,
      workedMinutes: 0,
      overtimeMinutes: 0,
      unpaidAbsenceDays: 0,
    });
    expect(amount).toBe(9_000_000);
  });

  it('HOURLY: multiplies the hourly rate by worked hours', () => {
    const amount = computeBaseAmount({ baseSalary: 50000, salaryType: 'HOURLY', overtimeRate: null }, 22, {
      workedDays: 0,
      workedMinutes: 160 * 60,
      overtimeMinutes: 0,
      unpaidAbsenceDays: 0,
    });
    expect(amount).toBe(8_000_000);
  });
});

describe('computeOvertimeAmount', () => {
  it('computes overtime pay from minutes at the resolved overtime rate', () => {
    const amount = computeOvertimeAmount({ baseSalary: 10_000_000, salaryType: 'MONTHLY', overtimeRate: 90000 }, 120);
    expect(amount).toBe(180000); // 2 hours * 90,000
  });

  it('is zero when there are no overtime minutes', () => {
    const amount = computeOvertimeAmount({ baseSalary: 10_000_000, salaryType: 'MONTHLY', overtimeRate: 90000 }, 0);
    expect(amount).toBe(0);
  });
});
