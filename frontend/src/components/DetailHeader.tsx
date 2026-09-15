import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Space, Typography } from 'antd';
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

/** Standardizes the back-button + title/status/actions card repeated across every detail page. */
export function DetailHeader({ backLabel, onBack, avatar, title, subtitle, actions, children }: DetailHeaderProps) {
  const titleBlock = (
    <div>
      <Typography.Title level={3} style={{ margin: 0 }}>
        {title}
      </Typography.Title>
      {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
    </div>
  );

  return (
    <>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={onBack} style={{ marginBottom: 8 }}>
        {backLabel}
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>{avatar ? <Space size={16} align="center">{avatar}{titleBlock}</Space> : titleBlock}</Col>
          {actions && <Col>{actions}</Col>}
        </Row>
        {children}
      </Card>
    </>
  );
}
