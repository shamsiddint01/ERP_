import { EnvironmentOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Skeleton, Tag, Typography } from 'antd';
import { getPortalGroups } from '../../api/portal';
import { EmptyState } from '../../components/EmptyState';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { palette } from '../../theme';
import type { EnrollmentStatus } from '../../types';
import { formatDate } from '../../utils/format';
import { DAY_SHORT } from './portalLabels';

const ENROLLMENT_STATUS: Record<EnrollmentStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Faol', color: 'green' },
  PAUSED: { label: 'Muzlatilgan', color: 'gold' },
  COMPLETED: { label: 'Tugatilgan', color: 'blue' },
  CANCELLED: { label: 'Bekor qilingan', color: 'default' },
  TRANSFERRED: { label: "Boshqa guruhga o'tgan", color: 'purple' },
};

const detailRow = { display: 'flex', alignItems: 'center', gap: 8, color: palette.textSecondary, fontSize: 13, marginTop: 6 } as const;

export function PortalGroupsPage() {
  const groupsQuery = useQuery({ queryKey: ['portal', 'groups'], queryFn: getPortalGroups });

  if (groupsQuery.isError) return <PageErrorState onRetry={() => groupsQuery.refetch()} />;

  const enrollments = groupsQuery.data ?? [];
  const current = enrollments.filter((e) => e.status === 'ACTIVE' || e.status === 'PAUSED');
  const past = enrollments.filter((e) => e.status !== 'ACTIVE' && e.status !== 'PAUSED');

  const renderCard = (enrollment: (typeof enrollments)[number], muted = false) => {
    const { group } = enrollment;
    const status = ENROLLMENT_STATUS[enrollment.status];
    const room = group.classroom ?? group.schedules[0]?.classroom;
    return (
      <Col xs={24} lg={12} key={enrollment.id}>
        <Card style={{ height: '100%', opacity: muted ? 0.7 : 1 }} styles={{ body: { padding: 22 } }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">{group.course.name}</div>
              <Typography.Title level={4} style={{ margin: '4px 0 0' }} ellipsis>
                {group.name}
              </Typography.Title>
            </div>
            <Tag color={status.color} style={{ height: 'fit-content', marginInlineEnd: 0 }}>
              {status.label}
            </Tag>
          </div>

          {group.schedules.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              {group.schedules.map((s) => (
                <div
                  key={s.id}
                  style={{ padding: '8px 12px', borderRadius: 10, background: palette.surfaceRaised, border: `1px solid ${palette.border}`, textAlign: 'center', minWidth: 92 }}
                >
                  <div style={{ fontWeight: 800, color: palette.primary }}>{DAY_SHORT[s.dayOfWeek]}</div>
                  <div style={{ fontSize: 12 }}>
                    {s.startTime}–{s.endTime}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            {group.teacherEmployee && (
              <div style={detailRow}>
                <UserOutlined /> {group.teacherEmployee.fullName}
                <a href={`tel:${group.teacherEmployee.phone}`} style={{ marginLeft: 'auto' }}>
                  <PhoneOutlined /> {group.teacherEmployee.phone}
                </a>
              </div>
            )}
            <div style={detailRow}>
              <EnvironmentOutlined /> {[group.branch.name, room?.name, group.branch.address].filter(Boolean).join(' · ')}
            </div>
            <div style={{ ...detailRow, marginTop: 10, fontSize: 12, color: palette.textMuted }}>
              Boshlangan: {formatDate(enrollment.startDate)}
              {enrollment.endDate && ` · Tugagan: ${formatDate(enrollment.endDate)}`} · Guruhda {group._count.enrollments} o'quvchi
            </div>
          </div>
        </Card>
      </Col>
    );
  };

  return (
    <div>
      <PageHeader title="Guruhlar" subtitle="Siz o'qiyotgan guruhlar va dars jadvali" />
      {groupsQuery.isLoading ? (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : current.length === 0 && past.length === 0 ? (
        <Card>
          <EmptyState title="Siz hali hech qaysi guruhga yozilmagansiz" description="Guruhga yozilish uchun markaz ma'muriyatiga murojaat qiling." />
        </Card>
      ) : (
        <>
          <Row gutter={[20, 20]}>{current.map((e) => renderCard(e))}</Row>
          {past.length > 0 && (
            <>
              <div className="eyebrow" style={{ margin: '28px 0 12px' }}>
                Oldingi guruhlar
              </div>
              <Row gutter={[20, 20]}>{past.map((e) => renderCard(e, true))}</Row>
            </>
          )}
        </>
      )}
    </div>
  );
}
