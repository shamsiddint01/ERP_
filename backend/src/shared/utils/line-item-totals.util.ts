export interface LineItemInput {
  quantity: number;
  unitPrice: number;
  taxPercent?: number;
  discountAmount?: number;
}

export type ComputedLineItem<T extends LineItemInput> = Omit<T, 'taxPercent' | 'discountAmount'> & {
  taxPercent: number;
  discountAmount: number;
  lineTotal: number;
};

export interface ComputedTotals<T extends LineItemInput> {
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
  lines: ComputedLineItem<T>[];
}

/**
 * Recomputes subtotal/tax/discount/grand totals from raw line items —
 * the backend never trusts a client-supplied total. Shared by
 * Purchases/Orders/Invoices since all three price line items the same way.
 */
export function computeLineItemTotals<T extends LineItemInput>(items: T[]): ComputedTotals<T> {
  let subtotal = 0;
  let taxTotal = 0;
  let discountTotal = 0;
  const lines = items.map((item) => {
    const lineSubtotal = item.quantity * item.unitPrice;
    const lineTax = lineSubtotal * ((item.taxPercent ?? 0) / 100);
    const lineDiscount = item.discountAmount ?? 0;
    const lineTotal = lineSubtotal + lineTax - lineDiscount;
    subtotal += lineSubtotal;
    taxTotal += lineTax;
    discountTotal += lineDiscount;
    return { ...item, taxPercent: item.taxPercent ?? 0, discountAmount: lineDiscount, lineTotal } as ComputedLineItem<T>;
  });
  return { subtotal, taxTotal, discountTotal, grandTotal: subtotal + taxTotal - discountTotal, lines };
}
