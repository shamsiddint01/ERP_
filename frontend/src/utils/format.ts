/**
 * Shared display formatters. Every table / card / detail view should format
 * dates and money through these so the app reads consistently (previously each
 * page hand-rolled its own `toLocaleString` call with drifting locales).
 */

const DATE_LOCALE = 'uz-UZ';

export function formatDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(DATE_LOCALE, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(DATE_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Relative "5 daqiqa oldin" style — used in the notification list. */
export function formatRelativeTime(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'hozirgina';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} daqiqa oldin`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} soat oldin`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days} kun oldin`;
  return formatDate(d);
}

export function formatNumber(value: number | string | null | undefined, fractionDigits = 0): string {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return '0';
  return n.toLocaleString(DATE_LOCALE, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

export function formatCurrency(value: number | string | null | undefined, currency = 'UZS'): string {
  return `${formatNumber(value, 2)} ${currency}`;
}
