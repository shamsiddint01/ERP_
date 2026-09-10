import { Tag } from 'antd';

/**
 * One place that maps every domain status enum to an Ant tag colour, so a
 * "PENDING" order and a "PENDING" expense look the same everywhere. Unknown
 * values fall through to a neutral tag with the raw text.
 */
const STATUS_COLORS: Record<string, string> = {
  // generic lifecycle
  DRAFT: 'default',
  ACTIVE: 'green',
  INACTIVE: 'default',
  SUSPENDED: 'orange',
  PENDING_INVITE: 'blue',
  CANCELLED: 'red',
  COMPLETED: 'green',
  // orders
  CONFIRMED: 'blue',
  PROCESSING: 'gold',
  // payment status
  UNPAID: 'red',
  PARTIALLY_PAID: 'gold',
  PAID: 'green',
  REFUNDED: 'purple',
  // invoices
  SENT: 'blue',
  OVERDUE: 'red',
  VOID: 'default',
  // purchase orders
  APPROVED: 'blue',
  RECEIVED: 'green',
  PARTIALLY_RECEIVED: 'gold',
  // expenses
  PENDING: 'gold',
  REJECTED: 'red',
  // payroll
  CALCULATING: 'blue',
  CALCULATED: 'cyan',
  // employees / periods
  ON_LEAVE: 'orange',
  TERMINATED: 'red',
  OPEN: 'green',
  CLOSED: 'default',
  // attendance
  PRESENT: 'green',
  LATE: 'gold',
  ABSENT: 'red',
  HALF_DAY: 'orange',
  HOLIDAY: 'blue',
  // notification severity
  INFO: 'blue',
  SUCCESS: 'green',
  WARNING: 'gold',
  CRITICAL: 'red',
};

export function StatusTag({ value }: { value: string | null | undefined }) {
  if (!value) return <Tag>—</Tag>;
  return <Tag color={STATUS_COLORS[value] ?? 'default'}>{value.replaceAll('_', ' ')}</Tag>;
}
