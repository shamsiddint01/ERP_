import type { PaymentStatus, TuitionChargeStatus } from '../types';

/**
 * The app shows only two payment states: "To'langan" and "To'lanmagan".
 * A tuition charge is To'langan only once fully paid (partly paid, pending
 * and overdue are all still owed); a payment record is To'langan only once
 * completed (pending, failed and refunded money didn't stay with the center).
 */
export type PaymentState = 'PAID' | 'UNPAID';

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = { PAID: "To'langan", UNPAID: "To'lanmagan" };
export const PAYMENT_STATE_COLORS: Record<PaymentState, string> = { PAID: 'green', UNPAID: 'red' };
export const PAYMENT_STATE_OPTIONS = (Object.keys(PAYMENT_STATE_LABELS) as PaymentState[]).map((value) => ({ value, label: PAYMENT_STATE_LABELS[value] }));

export const chargeState = (status: TuitionChargeStatus): PaymentState => (status === 'PAID' ? 'PAID' : 'UNPAID');
export const paymentState = (status: PaymentStatus): PaymentState => (status === 'COMPLETED' ? 'PAID' : 'UNPAID');

/** What is still owed on a charge (net amount minus everything allocated to it). */
export function chargeOutstanding(charge: { netAmount: string | number; allocations?: { amount: string | number }[] }): number {
  const paid = (charge.allocations ?? []).reduce((sum, a) => sum + Number(a.amount), 0);
  return Math.max(Number(charge.netAmount) - paid, 0);
}
