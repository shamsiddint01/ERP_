import { BookOutlined, EnvironmentOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Progress, Row, Skeleton, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { listGroups } from '../../api/groups';
import { EmptyState } from '../../components/EmptyState';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { palette } from '../../theme';
import type { GroupListItem, StudentGroupStatus } from '../../types';
import { formatDate } from '../../utils/format';

const GROUP_STATUS: Record<StudentGroupStatus, { label: string; color: string }> = {
  PLANNED: { label: 'Rejada', color: 'blue' },
  ACTIVE: { label: 'Faol', color: 'green' },
  PAUSED: { label: "To'xtatilgan", color: 'gold' },
  COMPLETED: { label: 'Tugagan', color: 'default' },
  CANCELLED: { label: 'Bekor qilingan', color: 'default' },
};

const detailRow = { display: 'flex', alignItems: 'center', gap: 8, color: palette.textSecondary, fontSize: 13, marginTop: 6 } as const;

/** Teacher → "Guruhlarim": the teacher's own groups (the backend already narrows /groups to them). A card opens the group page — students, homework, lessons. */
export function TeacherGroupsPage() {
  const navigate = useNavigate();
  const groupsQuery = useQuery({ queryKey: ['groups', { pageSize: 100, sortBy: 'name' }], queryFn: () => listGroups({ pageSize: 100, sortBy: 'name' }) });

  if (groupsQuery.isError) return <PageErrorState onRetry={() => groupsQuery.refetch()} />;

  const groups = groupsQuery.data?.items ?? [];
  const current = groups.filter((g) => g.status === 'ACTIVE' || g.status === 'PLANNED' || g.status === 'PAUSED');
  const past = groups.filter((g) => g.status === 'COMPLETED' || g.status === 'CANCELLED');

  const renderCard = (group: GroupListItem, muted = false) => {
    const status = GROUP_STATUS[group.status];
    return (
      <Col xs={24} md={12} xl={8} key={group.id}>
        <Card hoverable className="hover-lift" style={{ height: '100%', opacity: muted ? 0.7 : 1 }} styles={{ body: { padding: 22 } }} onClick={() => navigate(`/groups/${group.id}`)}>
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
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: palette.textSecondary }}>
                <TeamOutlined /> O'quvchilar
              </span>
              <strong>
                {group.enrolledCount} / {group.capacity}
              </strong>
            </div>
            <Progress percent={group.capacity ? Math.round((group.enrolledCount / group.capacity) * 100) : 0} showInfo={false} size="small" strokeColor={palette.primary} />
          </div>
          <div style={detailRow}>
            <EnvironmentOutlined /> {[group.branch.name, group.classroom?.name].filter(Boolean).join(' · ')}
          </div>
          <div style={detailRow}>
            <BookOutlined /> Boshlangan: {formatDate(group.startDate)}
            {group.endDate && ` · Tugashi: ${formatDate(group.endDate)}`}
          </div>
        </Card>
      </Col>
    );
  };

  return (
    <div>
      <PageHeader title="Guruhlarim" subtitle="Guruhni oching: o'quvchilar, uy ishi berish, darslar" />
      {groupsQuery.isLoading ? (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState title="Sizga hali guruh biriktirilmagan" description="Guruh biriktirish uchun markaz ma'muriyatiga murojaat qiling." />
        </Card>
      ) : (
        <>
          <Row gutter={[20, 20]}>{current.map((g) => renderCard(g))}</Row>
          {past.length > 0 && (
            <>
              <div className="eyebrow" style={{ margin: '28px 0 12px' }}>
                Tugagan guruhlar
              </div>
              <Row gutter={[20, 20]}>{past.map((g) => renderCard(g, true))}</Row>
            </>
          )}
        </>
      )}
    </div>
  );
}
