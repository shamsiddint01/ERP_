/** Shared amountPaid -> status reconciliation used by both Order.paymentStatus and Invoice.status. */
export function computePaymentStatus(amountPaid: number, grandTotal: number): 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' {
  if (amountPaid <= 0) return 'UNPAID';
  if (amountPaid < grandTotal) return 'PARTIALLY_PAID';
  return 'PAID';
}
