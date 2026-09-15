import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { Card, Skeleton, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useCountUp } from '../hooks/useCountUp';
import { palette } from '../theme';

interface StatCardProps {
  icon: ReactNode;
  title: string;
  value: number | undefined;
  loading?: boolean;
  color?: string;
  suffix?: string;
  /** One short supporting line under the value (e.g. "12 ta bu oy") — real data only, never invented. */
  description?: string;
  /** Real period-over-period change only — omit entirely rather than fabricate one. */
  trend?: { value: number; direction: 'up' | 'down' };
  formatter?: (value: number) => string;
  onClick?: () => void;
}

/** Dashboard KPI tile: icon badge + count-up value + title. One real number per card — never a fake trend. */
export function StatCard({ icon, title, value, loading, color = palette.primary, suffix, description, trend, formatter, onClick }: StatCardProps) {
  const animated = useCountUp(value);

  return (
    <Card size="small" className="hover-lift stat-card" onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined, height: '100%' }} styles={{ body: { padding: 16 } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          className="stat-card-icon"
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
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div
                  title={`${formatter ? formatter(animated) : animated.toLocaleString('uz-UZ')}${suffix ?? ''}`}
                  style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.3, color: '#111827', overflowWrap: 'anywhere' }}
                >
                  {formatter ? formatter(animated) : animated.toLocaleString('uz-UZ')}
                  {suffix}
                </div>
                {trend && (
                  <span style={{ fontSize: 12, fontWeight: 500, color: trend.direction === 'up' ? palette.success : palette.error, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    {trend.direction === 'up' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    {trend.value}%
                  </span>
                )}
              </div>
              {description && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {description}
                </Typography.Text>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
