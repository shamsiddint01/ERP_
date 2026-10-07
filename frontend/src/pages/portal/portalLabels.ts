import type { ExamType, PaymentMethod, PortalHomeworkState, ScheduleDayOfWeek } from '../../types';

export const DAY_LABELS: Record<ScheduleDayOfWeek, string> = {
  MONDAY: 'Dushanba',
  TUESDAY: 'Seshanba',
  WEDNESDAY: 'Chorshanba',
  THURSDAY: 'Payshanba',
  FRIDAY: 'Juma',
  SATURDAY: 'Shanba',
  SUNDAY: 'Yakshanba',
};

export const DAY_SHORT: Record<ScheduleDayOfWeek, string> = {
  MONDAY: 'Du',
  TUESDAY: 'Se',
  WEDNESDAY: 'Ch',
  THURSDAY: 'Pa',
  FRIDAY: 'Ju',
  SATURDAY: 'Sh',
  SUNDAY: 'Ya',
};

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  QUIZ: 'Test',
  MIDTERM: 'Oraliq nazorat',
  FINAL: 'Yakuniy nazorat',
  MOCK: 'Sinov imtihoni',
  PLACEMENT: 'Daraja aniqlash',
  OTHER: 'Boshqa',
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Naqd',
  CARD: 'Karta',
};

export const HOMEWORK_STATE: Record<PortalHomeworkState, { label: string; color: string }> = {
  PENDING: { label: 'Bajarilmagan', color: 'gold' },
  OVERDUE: { label: "Muddati o'tgan", color: 'red' },
  SUBMITTED: { label: 'Topshirilgan', color: 'blue' },
  GRADED: { label: 'Baholangan', color: 'green' },
};

/** "2026-10-08T11:00:00Z" → "11:00" in the browser's (Tashkent) time. */
export function time(value: string) {
  return new Date(value).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];

/** "Payshanba, 8-oktyabr" — manual lookup, since browsers often lack full uz-UZ date data. */
export function longDate(value: string | Date) {
  const d = new Date(value);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}-${MONTHS[d.getMonth()]}`;
}

/** Whole days from now until `value` (negative when it is in the past). */
export function daysUntil(value: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function dueLabel(value: string) {
  const days = daysUntil(value);
  if (days < 0) return `${-days} kun kechikdi`;
  if (days === 0) return 'Bugun';
  if (days === 1) return 'Ertaga';
  return `${days} kun qoldi`;
}
