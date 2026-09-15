import { Empty, Typography } from 'antd';
import type { ReactNode } from 'react';

/** Contextual empty state — a title + one helpful sentence + optional action, instead of AntD's bare "No data". */
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <Empty
      className="state-enter"
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      style={{ padding: '32px 0' }}
      description={
        <div>
          <Typography.Text strong>{title}</Typography.Text>
          {description && (
            <div>
              <Typography.Text type="secondary">{description}</Typography.Text>
            </div>
          )}
        </div>
      }
    >
      {action}
    </Empty>
  );
}
