import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Card, Typography } from 'antd';
import type { ReactNode } from 'react';

interface DetailHeaderProps {
  backLabel: string;
  onBack: () => void;
  /** e.g. a colored initials <Avatar> — rendered beside the title, not inside the heading text. */
  avatar?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Status tag + action buttons, e.g. wrapped in <ActionBar>. */
  actions?: ReactNode;
  /** Rendered inside the same card, below the title row — typically an <InfoGrid>. */
  children?: ReactNode;
}

/**
 * Standardizes the back-button + title/status/actions card repeated across
 * every detail page. Title and actions share one row while there is room;
 * on a narrow screen the actions drop below the title instead of pushing
 * past the edge, and a long name wraps instead of overflowing.
 */
export function DetailHeader({ backLabel, onBack, avatar, title, subtitle, actions, children }: DetailHeaderProps) {
  return (
    <>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={onBack} style={{ marginBottom: 8 }}>
        {backLabel}
      </Button>

      <Card style={{ marginBottom: 24 }} className="detail-header">
        <div className="detail-header-row">
          <div className="detail-header-title">
            {avatar && <div style={{ flexShrink: 0 }}>{avatar}</div>}
            <div style={{ minWidth: 0 }}>
              <Typography.Title level={3} style={{ margin: 0, overflowWrap: 'anywhere' }}>
                {title}
              </Typography.Title>
              {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
            </div>
          </div>
          {actions && <div className="detail-header-actions">{actions}</div>}
        </div>
        {children}
      </Card>
    </>
  );
}
