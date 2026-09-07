export type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'HEALTHY';

export function computeStockStatus(totalStock: number, minStockLevel: number): StockStatus {
  if (totalStock <= 0) return 'OUT_OF_STOCK';
  if (totalStock <= minStockLevel) return 'LOW_STOCK';
  return 'HEALTHY';
}
