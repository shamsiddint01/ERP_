import { Card, Space } from 'antd';
import type { ReactNode } from 'react';

/** Compact, visually-separated filter strip shared by list pages — never a giant panel. */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
      <Space wrap>{children}</Space>
    </Card>
  );
}
