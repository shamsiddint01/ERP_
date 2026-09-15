import { Space, Typography } from 'antd';
import type { ReactNode } from 'react';

/**
 * Drop-in replacement for the page-title block repeated near-identically
 * across ~45 pages (`<Space justify="space-between"><Title/></Space>`) —
 * exists so every page's header spacing/typography stays byte-identical
 * without hand-tuning each one.
 */
export function PageHeader({ title, subtitle, extra }: { title: ReactNode; subtitle?: ReactNode; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {subtitle}
          </Typography.Text>
        )}
      </div>
      {extra && (
        <Space wrap size={8}>
          {extra}
        </Space>
      )}
    </div>
  );
}
