import { Tag } from 'antd';
import type { StockStatus } from '../types';

const LABELS: Record<StockStatus, { label: string; color: string }> = {
  HEALTHY: { label: 'Yetarli', color: 'green' },
  LOW_STOCK: { label: 'Kam qoldi', color: 'orange' },
  OUT_OF_STOCK: { label: 'Tugagan', color: 'red' },
};

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const { label, color } = LABELS[status];
  return <Tag color={color}>{label}</Tag>;
}
