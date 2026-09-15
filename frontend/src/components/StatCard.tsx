import { Card, Skeleton, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useCountUp } from '../hooks/useCountUp';

interface StatCardProps {
  icon: ReactNode;
  title: string;
  value: number | undefined;
  loading?: boolean;
  color?: string;
  suffix?: string;
  formatter?: (value: number) => string;
  onClick?: () => void;
}

/** Dashboard KPI tile: icon badge + count-up value + title. One real number per card — never a fake trend. */
export function StatCard({ icon, title, value, loading, color = '#4F46E5', suffix, formatter, onClick }: StatCardProps) {
  const animated = useCountUp(value);

  return (
    <Card size="small" className="hover-lift" onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined, height: '100%' }} styles={{ body: { padding: 16 } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            color,
            background: `${color}1A`,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Typography.Text
            type="secondary"
            title={title}
            style={{ fontSize: 13, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {title}
          </Typography.Text>
          {loading ? (
            <Skeleton.Input active size="small" style={{ display: 'block', marginTop: 4, width: 80 }} />
          ) : (
            <div
              title={`${formatter ? formatter(animated) : animated.toLocaleString('uz-UZ')}${suffix ?? ''}`}
              style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.3, color: '#111827', overflowWrap: 'anywhere' }}
            >
              {formatter ? formatter(animated) : animated.toLocaleString('uz-UZ')}
              {suffix}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
