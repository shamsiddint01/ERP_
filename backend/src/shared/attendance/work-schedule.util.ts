export interface WorkSchedule {
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  lateThresholdMinutes: number;
}

const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  startTime: '09:00',
  endTime: '18:00',
  lateThresholdMinutes: 0,
};

/** Reads the configurable work schedule out of CompanySettings.workScheduleSettings, falling back to sane defaults — never hard-coded at the call site. */
export function resolveWorkSchedule(raw: unknown): WorkSchedule {
  if (!raw || typeof raw !== 'object') return DEFAULT_WORK_SCHEDULE;
  const candidate = raw as Partial<WorkSchedule>;
  return {
    startTime: typeof candidate.startTime === 'string' ? candidate.startTime : DEFAULT_WORK_SCHEDULE.startTime,
    endTime: typeof candidate.endTime === 'string' ? candidate.endTime : DEFAULT_WORK_SCHEDULE.endTime,
    lateThresholdMinutes: typeof candidate.lateThresholdMinutes === 'number' ? candidate.lateThresholdMinutes : DEFAULT_WORK_SCHEDULE.lateThresholdMinutes,
  };
}

/**
 * Combines a "HH:mm" schedule time with the calendar day of `on` into a
 * concrete Date. Anchored in UTC (not the server's local timezone) so the
 * result never drifts depending on where this process happens to be
 * deployed — the same convention AttendanceService.utcMidnight() and
 * DashboardService's own UTC-day helpers already use for calendar-day bucketing.
 */
function scheduleTimeOnDay(time: string, on: Date): Date {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate(), hours, minutes, 0, 0));
}

/** Minutes the check-in happened after (schedule start + grace threshold); 0 if on time or early. */
export function computeLateMinutes(checkInAt: Date, schedule: WorkSchedule): number {
  const scheduledStart = scheduleTimeOnDay(schedule.startTime, checkInAt);
  const graceDeadline = new Date(scheduledStart.getTime() + schedule.lateThresholdMinutes * 60_000);
  const diffMinutes = Math.round((checkInAt.getTime() - graceDeadline.getTime()) / 60_000);
  return diffMinutes > 0 ? diffMinutes : 0;
}

/** Minutes the check-out happened after the scheduled end; 0 if left on time or early. */
export function computeOvertimeMinutes(checkOutAt: Date, schedule: WorkSchedule): number {
  const scheduledEnd = scheduleTimeOnDay(schedule.endTime, checkOutAt);
  const diffMinutes = Math.round((checkOutAt.getTime() - scheduledEnd.getTime()) / 60_000);
  return diffMinutes > 0 ? diffMinutes : 0;
}

/** Hours worked between check-in and check-out, to 2 decimal places. Never trusts a client-submitted value. */
export function computeHoursWorked(checkInAt: Date, checkOutAt: Date): number {
  const minutes = (checkOutAt.getTime() - checkInAt.getTime()) / 60_000;
  return Math.round((minutes / 60) * 100) / 100;
}
