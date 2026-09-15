import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Typography } from 'antd';
import type { ReactNode } from 'react';

interface DetailHeaderProps {
  backLabel: string;
  onBack: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Status tag + action buttons, e.g. wrapped in <ActionBar>. */
  actions?: ReactNode;
  /** Rendered inside the same card, below the title row — typically an <InfoGrid>. */
  children?: ReactNode;
}

/** Standardizes the back-button + title/status/actions card repeated across every detail page. */
export function DetailHeader({ backLabel, onBack, title, subtitle, actions, children }: DetailHeaderProps) {
  return (
    <>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={onBack} style={{ marginBottom: 8 }}>
        {backLabel}
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {title}
            </Typography.Title>
            {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
          </Col>
          {actions && <Col>{actions}</Col>}
        </Row>
        {children}
      </Card>
    </>
  );
}
