import { Col, Row } from 'antd';
import type { ReactNode } from 'react';
import { StatCard } from './StatCard';

export interface SummaryCardItem {
  icon: ReactNode;
  label: string;
  value: number | undefined;
  color?: string;
  formatter?: (value: number) => string;
  suffix?: string;
}

/** Small stat-tile row for detail pages (e.g. "Xonalar soni / O'quvchilar soni") — same visual family as dashboard StatCards, not a bare Statistic. */
export function SummaryCard({ items }: { items: SummaryCardItem[] }) {
  const span = Math.max(Math.floor(24 / items.length), 8);
  return (
    <Row gutter={16} style={{ marginBottom: 24 }}>
      {items.map((item, index) => (
        <Col key={index} xs={24} sm={12} md={span}>
          <StatCard icon={item.icon} title={item.label} value={item.value} color={item.color} formatter={item.formatter} suffix={item.suffix} />
        </Col>
      ))}
    </Row>
  );
}
