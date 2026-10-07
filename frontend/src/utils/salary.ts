import { formatNumber } from './format';

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

/** "2026-10" → "Oktabr 2026". */
export function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

/** The current salary month in Tashkent time (UTC+5), as the backend counts it — "YYYY-MM". */
export function currentPeriod(): string {
  return new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 7);
}

export const som = (value: number | string) => `${formatNumber(value)} so'm`;
