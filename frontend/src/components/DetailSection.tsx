import { Card } from 'antd';
import type { ReactNode } from 'react';

/** Titled card wrapper for a detail page's sub-sections (related list, history table, etc.). */
export function DetailSection({ title, extra, children }: { title: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <Card title={title} extra={extra} style={{ marginBottom: 24 }}>
      {children}
    </Card>
  );
}
