import type { AttendanceStatus, SalaryType } from '@prisma/client';

export interface AttendanceSummary {
  workedDays: number;
  workedMinutes: number;
  overtimeMinutes: number;
  unpaidAbsenceDays: number;
}

export interface CompensationInput {
  baseSalary: number;
  salaryType: SalaryType;
  overtimeRate: number | null;
}

const STANDARD_MONTHLY_MINUTES = 176 * 60; // 22 working days x 8 hours — a fixed, documented business constant, not per-employee-hidden magic.
const OVERTIME_MULTIPLIER = 1.5;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Reduces a period's attendance rows to the figures Payroll needs — pure, deterministic, no DB access. */
export function summarizeAttendance(records: Array<{ status: AttendanceStatus; hoursWorked: unknown; overtimeMinutes: number }>): AttendanceSummary {
  let workedDays = 0;
  let workedMinutes = 0;
  let overtimeMinutes = 0;
  let unpaidAbsenceDays = 0;

  for (const record of records) {
    if (record.status === 'PRESENT' || record.status === 'LATE') {
      workedDays += 1;
    } else if (record.status === 'HALF_DAY') {
      workedDays += 0.5;
    } else if (record.status === 'ABSENT') {
      unpaidAbsenceDays += 1;
    }
    // ON_LEAVE and HOLIDAY are neither worked nor an unpaid absence — approved leave/holidays are paid.

    if (record.hoursWorked !== null && record.hoursWorked !== undefined) {
      workedMinutes += Math.round(Number(record.hoursWorked) * 60);
    }
    overtimeMinutes += record.overtimeMinutes;
  }

  return { workedDays, workedMinutes, overtimeMinutes, unpaidAbsenceDays };
}

/** Count of Mon-Fri calendar days in [start, end], inclusive, UTC-anchored. */
export function countStandardWorkingDays(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor <= last) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/** The equivalent hourly rate for any salary basis — the common unit overtime is always computed in. */
export function resolveHourlyRate(compensation: CompensationInput): number {
  if (compensation.salaryType === 'HOURLY') return compensation.baseSalary;
  if (compensation.salaryType === 'DAILY') return compensation.baseSalary / 8;
  return compensation.baseSalary / (STANDARD_MONTHLY_MINUTES / 60);
}

/** The per-hour overtime rate: explicit compensation.overtimeRate if set, else 1.5x the resolved hourly rate. */
export function resolveOvertimeRate(compensation: CompensationInput): number {
  if (compensation.overtimeRate !== null) return compensation.overtimeRate;
  return round2(resolveHourlyRate(compensation) * OVERTIME_MULTIPLIER);
}

/** Base pay for the period, prorated by unpaid absence for MONTHLY staff, or driven directly by days/hours worked otherwise. */
export function computeBaseAmount(compensation: CompensationInput, standardWorkingDays: number, summary: AttendanceSummary): number {
  if (compensation.salaryType === 'MONTHLY') {
    if (standardWorkingDays <= 0) return 0;
    const payableDays = Math.max(0, standardWorkingDays - summary.unpaidAbsenceDays);
    return round2(compensation.baseSalary * (payableDays / standardWorkingDays));
  }
  if (compensation.salaryType === 'DAILY') {
    return round2(compensation.baseSalary * summary.workedDays);
  }
  return round2(compensation.baseSalary * (summary.workedMinutes / 60));
}

export function computeOvertimeAmount(compensation: CompensationInput, overtimeMinutes: number): number {
  return round2(resolveOvertimeRate(compensation) * (overtimeMinutes / 60));
}
