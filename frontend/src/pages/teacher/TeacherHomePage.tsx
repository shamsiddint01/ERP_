import { ArrowRightOutlined, BookOutlined, CalendarOutlined, CheckSquareOutlined, FormOutlined, GroupOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, Row, Skeleton, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { getDashboardOverview, getDashboardToday } from '../../api/dashboard';
import { listExams } from '../../api/exams';
import { listHomework } from '../../api/homework';
import { getMySalary } from '../../api/salaries';
import { EmptyState } from '../../components/EmptyState';
import { StatCard } from '../../components/StatCard';
import { useAuthStore } from '../../store/auth.store';
import { palette } from '../../theme';
import { formatNumber } from '../../utils/format';
import { EXAM_TYPE_LABELS, daysUntil, longDate, time } from '../portal/portalLabels';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Xayrli tun';
  if (hour < 12) return 'Xayrli tong';
  if (hour < 18) return 'Xayrli kun';
  return 'Xayrli kech';
}

const LESSON_STATUS: Record<string, { label: string; color: string }> = {
  SCHEDULED: { label: 'Rejada', color: 'blue' },
  IN_PROGRESS: { label: 'Davom etmoqda', color: 'processing' },
  COMPLETED: { label: 'Yakunlangan', color: 'green' },
  CANCELLED: { label: 'Bekor qilingan', color: 'default' },
};

const row = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${palette.border}` } as const;

export function TeacherHomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const todayQuery = useQuery({ queryKey: ['dashboard', 'today'], queryFn: getDashboardToday });
  const overviewQuery = useQuery({ queryKey: ['dashboard', 'overview'], queryFn: getDashboardOverview });
  const homeworkQuery = useQuery({ queryKey: ['homework', { pageSize: 100 }], queryFn: () => listHomework({ pageSize: 100 }) });
  const examsQuery = useQuery({ queryKey: ['exams', { status: 'SCHEDULED', forTeacherHome: true }], queryFn: () => listExams({ status: 'SCHEDULED', pageSize: 50 }) });
  const salaryQuery = useQuery({ queryKey: ['salary', 'me'], queryFn: () => getMySalary() });

  const toCheck = (homeworkQuery.data?.items ?? []).filter((h) => h.submittedCount > h.gradedCount);
  const ungraded = toCheck.reduce((sum, h) => sum + (h.submittedCount - h.gradedCount), 0);
  const upcomingExams = (examsQuery.data?.items ?? []).filter((e) => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const lessons = todayQuery.data?.schedule ?? [];

  return (
    <div className="dashboard-stagger">
      <Card style={{ background: palette.heroGradient, marginBottom: 20 }} styles={{ body: { padding: 28 } }}>
        <div className="eyebrow">{longDate(new Date())}</div>
        <Typography.Title level={3} style={{ margin: '6px 0 4px' }}>
          {greeting()}, {user?.fullName?.split(' ')[0]}!
        </Typography.Title>
        <Typography.Text type="secondary">
          Bugun {lessons.length} ta darsingiz bor{ungraded > 0 ? `, ${ungraded} ta uy ishi tekshirishni kutmoqda` : ''}.
        </Typography.Text>
        <div className="hero-actions">
          <Button className="hero-action" type="primary" icon={<CalendarOutlined />} onClick={() => navigate('/schedule')}>
            Dars jadvali
          </Button>
          <Button className="hero-action" icon={<BookOutlined />} onClick={() => navigate('/homework')}>
            Uy ishlarini tekshirish
          </Button>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard icon={<CalendarOutlined />} title="Bugungi darslar" value={lessons.length} loading={todayQuery.isLoading} color={palette.primary} onClick={() => navigate('/schedule')} />
        <StatCard icon={<BookOutlined />} title="Tekshirilmagan uy ishi" value={ungraded} loading={homeworkQuery.isLoading} color={ungraded > 0 ? palette.ember : palette.success} onClick={() => navigate('/homework')} />
        <StatCard icon={<GroupOutlined />} title="Faol guruhlarim" value={overviewQuery.data?.kpis.activeGroups ?? 0} loading={overviewQuery.isLoading} color={palette.info} onClick={() => navigate('/groups')} />
        <StatCard
          icon={<FormOutlined />}
          title="Bu oy maosh"
          value={salaryQuery.data?.earned ?? 0}
          loading={salaryQuery.isLoading}
          formatter={(v) => formatNumber(v)}
          suffix=" so'm"
          color={palette.success}
          onClick={() => navigate('/salary')}
        />
      </div>

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={14}>
          <Card title="Bugungi darslar" style={{ height: '100%' }}>
            {todayQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 3 }} />
            ) : lessons.length === 0 ? (
              <EmptyState title="Bugun darsingiz yo'q" />
            ) : (
              lessons.map((lesson) => {
                const status = LESSON_STATUS[lesson.status] ?? { label: lesson.status, color: 'default' };
                return (
                  <div key={lesson.id} style={row}>
                    <div style={{ width: 58, textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{time(lesson.scheduledStart)}</div>
                      <div style={{ fontSize: 11, color: palette.textMuted }}>{time(lesson.scheduledEnd)}</div>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Typography.Text strong ellipsis style={{ display: 'block' }}>
                        {lesson.group.name}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {lesson.classroom?.name ?? lesson.branch.name}
                      </Typography.Text>
                    </div>
                    <Tag color={status.color}>{status.label}</Tag>
                    {lesson.status !== 'CANCELLED' && (
                      <Button size="small" type="primary" icon={<CheckSquareOutlined />} onClick={() => navigate(`/lessons/${lesson.id}/attendance`)}>
                        Davomat
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            title="Tekshirish kerak"
            extra={
              toCheck.length > 0 && (
                <Button type="link" size="small" onClick={() => navigate('/homework')}>
                  Barchasi <ArrowRightOutlined />
                </Button>
              )
            }
            style={{ marginBottom: 20 }}
          >
            {homeworkQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 2 }} />
            ) : toCheck.length === 0 ? (
              <EmptyState title="Hammasi tekshirilgan" />
            ) : (
              toCheck.slice(0, 4).map((hw) => (
                <div key={hw.id} style={{ ...row, cursor: 'pointer' }} onClick={() => navigate('/homework')}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Typography.Text strong ellipsis style={{ display: 'block' }}>
                      {hw.title}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {hw.group.name}
                    </Typography.Text>
                  </div>
                  <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                    {hw.submittedCount - hw.gradedCount} ta
                  </Tag>
                </div>
              ))
            )}
          </Card>
          <Card title="Yaqin imtihonlar">
            {examsQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 2 }} />
            ) : upcomingExams.length === 0 ? (
              <EmptyState title="Rejalashtirilgan imtihon yo'q" />
            ) : (
              upcomingExams.slice(0, 4).map((exam) => (
                <div key={exam.id} style={{ ...row, cursor: 'pointer' }} onClick={() => navigate(`/exams/${exam.id}`)}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Typography.Text strong ellipsis style={{ display: 'block' }}>
                      {exam.title}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {EXAM_TYPE_LABELS[exam.type]} · {exam.group.name}
                    </Typography.Text>
                  </div>
                  <span style={{ fontSize: 12, color: palette.textSecondary, whiteSpace: 'nowrap' }}>{longDate(exam.date)}</span>
                </div>
              ))
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
