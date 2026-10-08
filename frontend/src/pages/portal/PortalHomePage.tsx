import { ArrowRightOutlined, BookOutlined, CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, FormOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, Row, Skeleton, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { getPortalOverview } from '../../api/portal';
import { EmptyState } from '../../components/EmptyState';
import { PageErrorState } from '../../components/PageErrorState';
import { StatCard } from '../../components/StatCard';
import { palette } from '../../theme';
import { formatNumber } from '../../utils/format';
import { EXAM_TYPE_LABELS, daysUntil, dueLabel, longDate, time } from './portalLabels';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Xayrli tun';
  if (hour < 12) return 'Xayrli tong';
  if (hour < 18) return 'Xayrli kun';
  return 'Xayrli kech';
}

const listRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 0',
  borderBottom: `1px solid ${palette.border}`,
} as const;

export function PortalHomePage() {
  const navigate = useNavigate();
  const overviewQuery = useQuery({ queryKey: ['portal', 'overview'], queryFn: getPortalOverview });

  if (overviewQuery.isError) return <PageErrorState onRetry={() => overviewQuery.refetch()} />;
  if (overviewQuery.isLoading || !overviewQuery.data) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  const { student, balance, nextLessons, pendingHomework, nextExam, attendancePercentage, myExtraLessons } = overviewQuery.data;
  const owes = balance.outstanding > 0;

  return (
    <div className="dashboard-stagger">
      <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
        <Col xs={24} xl={15}>
          <Card style={{ height: '100%', background: palette.heroGradient }} styles={{ body: { padding: 28 } }}>
            <div className="eyebrow">{longDate(new Date())}</div>
            <Typography.Title level={3} style={{ margin: '6px 0 4px' }}>
              {greeting()}, {student.firstName}!
            </Typography.Title>
            <Typography.Text type="secondary">
              {student.studentCode}
              {student.branch && ` · ${student.branch.name}`}
            </Typography.Text>
            <div className="hero-actions">
              <Button className="hero-action" type="primary" icon={<BookOutlined />} onClick={() => navigate('/homework')}>
                Uy ishlari {pendingHomework.count > 0 && `(${pendingHomework.count})`}
              </Button>
              <Button className="hero-action" icon={<CalendarOutlined />} onClick={() => navigate('/extra-lessons')}>
                Qo'shimcha darslar
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <div
            onClick={() => navigate('/payments')}
            className="hover-lift"
            style={{
              height: '100%',
              minHeight: 190,
              cursor: 'pointer',
              borderRadius: 16,
              padding: 24,
              background: owes ? palette.accentGradient : 'linear-gradient(135deg, #1f9d6b 0%, #3DD68C 100%)',
              color: '#17181C',
              boxShadow: owes ? '0 18px 40px rgba(239, 91, 52, 0.28)' : '0 18px 40px rgba(61, 214, 140, 0.22)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.14)' }} />
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.75 }}>
              {owes ? "To'lanishi kerak" : "To'lovlar"}
            </div>
            <div>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {owes ? `${formatNumber(balance.outstanding)} so'm` : "Qarz yo'q"}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8, marginTop: 6 }}>
                {balance.overdue > 0 ? `Muddati o'tgan: ${formatNumber(balance.overdue)} so'm` : `Jami to'langan: ${formatNumber(balance.paid)} so'm`}
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              To'lovlarim <ArrowRightOutlined />
            </div>
          </div>
        </Col>
      </Row>

      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard icon={<CheckCircleOutlined />} title="Davomat" value={attendancePercentage} suffix="%" color={palette.success} onClick={() => navigate('/progress')} />
        <StatCard
          icon={<BookOutlined />}
          title="Bajarilmagan uy ishi"
          value={pendingHomework.count}
          color={pendingHomework.overdue > 0 ? palette.error : palette.primary}
          description={pendingHomework.overdue > 0 ? `${pendingHomework.overdue} tasi muddati o'tgan` : undefined}
          onClick={() => navigate('/homework')}
        />
        <StatCard icon={<CalendarOutlined />} title="Qo'shimcha darslarim" value={myExtraLessons.length} color={palette.info} onClick={() => navigate('/extra-lessons')} />
        <StatCard
          icon={<FormOutlined />}
          title="Keyingi imtihon"
          value={nextExam ? Math.max(daysUntil(nextExam.date), 0) : 0}
          formatter={(v) => (nextExam ? (v === 0 ? 'Bugun' : `${v} kun`) : '—')}
          color={palette.ember}
          onClick={() => navigate('/exams')}
        />
      </div>

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={12}>
          <Card title="Yaqin darslar" style={{ height: '100%' }}>
            {nextLessons.length === 0 ? (
              <EmptyState title="Yaqin kunlarda dars yo'q" />
            ) : (
              nextLessons.map((lesson) => (
                <div key={lesson.id} style={listRow}>
                  <div style={{ width: 58, textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{time(lesson.scheduledStart)}</div>
                    <div style={{ fontSize: 11, color: palette.textMuted }}>{time(lesson.scheduledEnd)}</div>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Typography.Text strong ellipsis style={{ display: 'block' }}>
                      {lesson.group.name}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {longDate(lesson.scheduledStart)}
                      {lesson.classroom && ` · ${lesson.classroom.name}`}
                      {lesson.teacherEmployee && ` · ${lesson.teacherEmployee.fullName}`}
                    </Typography.Text>
                  </div>
                  {lesson.status === 'IN_PROGRESS' && <Tag color="processing">Hozir</Tag>}
                </div>
              ))
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="Bajarilishi kerak"
            extra={
              pendingHomework.count > 0 && (
                <Button type="link" size="small" onClick={() => navigate('/homework')}>
                  Barchasi
                </Button>
              )
            }
            style={{ height: '100%' }}
          >
            {pendingHomework.items.length === 0 ? (
              <EmptyState title="Hamma uy ishlari topshirilgan" description="Barakalla! Yangi vazifa berilsa shu yerda ko'rinadi." />
            ) : (
              pendingHomework.items.map((hw) => {
                const overdue = daysUntil(hw.dueDate) < 0;
                return (
                  <div key={hw.id} style={{ ...listRow, cursor: 'pointer' }} onClick={() => navigate('/homework')}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: overdue ? palette.error : palette.primary,
                        background: overdue ? 'rgba(242,92,74,0.12)' : 'rgba(245,165,36,0.12)',
                      }}
                    >
                      {overdue ? <ClockCircleOutlined /> : <BookOutlined />}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Typography.Text strong ellipsis style={{ display: 'block' }}>
                        {hw.title}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {hw.group.name}
                      </Typography.Text>
                    </div>
                    <Tag color={overdue ? 'red' : daysUntil(hw.dueDate) <= 1 ? 'gold' : 'default'} style={{ marginInlineEnd: 0 }}>
                      {dueLabel(hw.dueDate)}
                    </Tag>
                  </div>
                );
              })
            )}
            {nextExam && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: palette.surfaceRaised, border: `1px solid ${palette.border}` }}>
                <div className="eyebrow" style={{ marginBottom: 4 }}>
                  Keyingi imtihon
                </div>
                <Typography.Text strong>{nextExam.title}</Typography.Text>
                <div style={{ fontSize: 12, color: palette.textSecondary }}>
                  {EXAM_TYPE_LABELS[nextExam.type]} · {nextExam.group.name} · {longDate(nextExam.date)}
                </div>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
