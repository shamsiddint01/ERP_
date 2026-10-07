import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { Card, Skeleton, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useCountUp } from '../hooks/useCountUp';
import { palette, tint } from '../theme';

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
  const { value: animated, ref: countRef } = useCountUp(value);

  return (
    <Card size="small" className="hover-lift stat-card" onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined, height: '100%' }} styles={{ body: { padding: 18 } }}>
      <div className="eyebrow" title={title} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5, letterSpacing: '0.08em', minHeight: 33 }}>
        {title}
      </div>
      {loading ? (
        <Skeleton.Input active size="small" style={{ display: 'block', marginTop: 10, width: 96 }} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div
              ref={countRef}
              title={`${formatter ? formatter(animated) : animated.toLocaleString('uz-UZ')}${suffix ?? ''}`}
              style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em', color: palette.text, overflowWrap: 'anywhere' }}
            >
              {formatter ? formatter(animated) : animated.toLocaleString('uz-UZ')}
              {suffix && <span style={{ fontSize: 15, fontWeight: 600, color: palette.textSecondary, marginLeft: 2 }}>{suffix}</span>}
            </div>
            {trend && (
              <span style={{ fontSize: 12, fontWeight: 600, color: trend.direction === 'up' ? palette.success : palette.error, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                {trend.direction === 'up' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                {trend.value}%
              </span>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <div
                className="stat-card-icon"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  color,
                  background: tint(color, 12),
                  boxShadow: `0 0 0 1px ${tint(color, 18)} inset`,
                  flexShrink: 0,
                }}
              >
                {icon}
              </div>
            </div>
          </div>
          {description && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {description}
            </Typography.Text>
          )}
        </>
      )}
    </Card>
  );
}
