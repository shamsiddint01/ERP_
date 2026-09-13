import type { StudentAttendanceStatus } from '../types';

/** Shared across every Student Attendance page/component so the four statuses always read the same way. */
export const ATTENDANCE_STATUS_OPTIONS: Array<{ value: StudentAttendanceStatus; label: string }> = [
  { value: 'PRESENT', label: 'Keldi' },
  { value: 'ABSENT', label: 'Kelmadi' },
  { value: 'LATE', label: 'Kech qoldi' },
  { value: 'EXCUSED', label: 'Sababli' },
];

export const ATTENDANCE_STATUS_LABELS: Record<StudentAttendanceStatus, string> = {
  PRESENT: 'Keldi',
  ABSENT: 'Kelmadi',
  LATE: 'Kech qoldi',
  EXCUSED: 'Sababli',
};

export const ATTENDANCE_STATUS_COLORS: Record<StudentAttendanceStatus, string> = {
  PRESENT: 'green',
  ABSENT: 'red',
  LATE: 'gold',
  EXCUSED: 'blue',
};
