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

/**
 * Phase H — the teacher-specific figures computeBaseAmount needs for
 * PER_LESSON/PER_GROUP/MIXED. All four fields are pre-computed by the
 * caller (PayrollCalculationService) from real DB rows — this stays a pure
 * function, no DB access here, same rule the rest of this file follows.
 */
export interface TeacherCompensationInput {
  perLessonRate: number | null;
  perGroupRate: number | null;
  /** Count of this teacher's Lesson rows with status=COMPLETED in the payroll period — cancelled lessons are never counted (excluded by the caller's query, not here). */
  completedLessons: number;
  /** Count of StudentGroup rows this teacher currently teaches whose status=ACTIVE and whose date range overlaps the payroll period. */
  activeGroups: number;
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

/** MONTHLY's own proration, factored out so MIXED can reuse it verbatim instead of duplicating the formula. */
function computeMonthlyBase(baseSalary: number, standardWorkingDays: number, unpaidAbsenceDays: number): number {
  if (standardWorkingDays <= 0) return 0;
  const payableDays = Math.max(0, standardWorkingDays - unpaidAbsenceDays);
  return round2(baseSalary * (payableDays / standardWorkingDays));
}

/**
 * Base pay for the period. MONTHLY prorates by unpaid absence; DAILY/HOURLY
 * are driven directly by days/hours worked. The Phase H additions:
 * PER_LESSON = perLessonRate x completed lessons; PER_GROUP = perGroupRate x
 * active groups; MIXED = a MONTHLY-style prorated base PLUS both of those —
 * a teacher on a reduced guaranteed salary who also earns per lesson/group.
 * `teacher` is only read for those three types; every existing salary type's
 * behavior is completely unchanged (verified by the pre-Phase-H test suite,
 * none of which passes a 4th argument).
 */
export function computeBaseAmount(
  compensation: CompensationInput,
  standardWorkingDays: number,
  summary: AttendanceSummary,
  teacher?: TeacherCompensationInput | null,
): number {
  if (compensation.salaryType === 'MONTHLY') {
    return computeMonthlyBase(compensation.baseSalary, standardWorkingDays, summary.unpaidAbsenceDays);
  }
  if (compensation.salaryType === 'DAILY') {
    return round2(compensation.baseSalary * summary.workedDays);
  }
  if (compensation.salaryType === 'PER_LESSON') {
    return round2((teacher?.perLessonRate ?? 0) * (teacher?.completedLessons ?? 0));
  }
  if (compensation.salaryType === 'PER_GROUP') {
    return round2((teacher?.perGroupRate ?? 0) * (teacher?.activeGroups ?? 0));
  }
  if (compensation.salaryType === 'MIXED') {
    const base = computeMonthlyBase(compensation.baseSalary, standardWorkingDays, summary.unpaidAbsenceDays);
    const lessonPart = round2((teacher?.perLessonRate ?? 0) * (teacher?.completedLessons ?? 0));
    const groupPart = round2((teacher?.perGroupRate ?? 0) * (teacher?.activeGroups ?? 0));
    return round2(base + lessonPart + groupPart);
  }
  // HOURLY
  return round2(compensation.baseSalary * (summary.workedMinutes / 60));
}

export function computeOvertimeAmount(compensation: CompensationInput, overtimeMinutes: number): number {
  return round2(resolveOvertimeRate(compensation) * (overtimeMinutes / 60));
}
