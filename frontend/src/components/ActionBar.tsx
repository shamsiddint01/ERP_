import { Space } from 'antd';
import type { ReactNode } from 'react';

/** Consistent gap/wrap for a detail page's status tag + action buttons row. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <Space wrap size={8}>
      {children}
    </Space>
  );
}
