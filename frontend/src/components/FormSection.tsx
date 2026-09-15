import { Typography } from 'antd';
import type { ReactNode } from 'react';

/** Groups a large form into labeled sections (Basic info / Relationships / Configuration / Notes) instead of one flat wall of fields. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <Typography.Text
        strong
        style={{ fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', color: 'rgba(17,24,39,0.45)', display: 'block', marginBottom: 8 }}
      >
        {title}
      </Typography.Text>
      {children}
    </div>
  );
}
