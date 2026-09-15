import {
  AlertOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  FormOutlined,
  GroupOutlined,
  RiseOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, Row, Skeleton, Space, Table, Tag, Typography } from 'antd';
import type { ReactElement, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getDashboardCharts, getDashboardOverview, getDashboardToday } from '../api/dashboard';
import { EmptyState } from '../components/EmptyState';
import { PageErrorState } from '../components/PageErrorState';
import { StatCard } from '../components/StatCard';
import { chartTooltipLabelStyle, chartTooltipStyle, palette } from '../theme';
import { useAuthStore } from '../store/auth.store';
import { formatNumber } from '../utils/format';

const PIE_COLORS = [palette.primary, palette.success, palette.warning, palette.error, '#7C3AED', palette.info];

const LESSON_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Rejalashtirilgan',
  IN_PROGRESS: 'Davom etmoqda',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
  NO_SHOW: "Kelinmadi",
};

const LESSON_STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'blue',
  IN_PROGRESS: 'processing',
  COMPLETED: 'green',
  CANCELLED: 'default',
  NO_SHOW: 'red',
};

const ACTION_REQUIRED_LABELS: Record<string, string> = {
  overdueTuition: "Muddati o'tgan to'lovlar",
  pendingPayroll: 'Tasdiqlashni kutayotgan ish haqi',
  pendingExpenses: 'Tasdiqlashni kutayotgan xarajatlar',
  absentStudentsToday: 'Bugun kelmagan o\'quvchilar',
  upcomingExams: 'Kutilayotgan imtihonlar',
  newLeads: 'Yangi lidlar',
  unreadNotifications: "O'qilmagan bildirishnomalar",
};

const money = (value: number) => formatNumber(value, 2);

// `toLocaleDateString('uz-UZ', { weekday: 'long', month: 'long' })` falls
// back to broken output ("M09 15, Tue") in browsers without full uz-UZ CLDR
// data — a manual lookup is the only reliable way to get real Uzbek names.
const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
];
function formatLongDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()}-${MONTHS[date.getMonth()]}`;
}

function time(value: string) {
  return new Date(value).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Col xs={24} md={12}>
      <Card title={title} className="hover-lift" style={{ height: '100%' }}>
        <ResponsiveContainer width="100%" height={220}>
          {children as ReactElement}
        </ResponsiveContainer>
      </Card>
    </Col>
  );
}

const HOUR_GREETINGS: [number, string][] = [
  [5, 'Xayrli tong'],
  [12, 'Xayrli kun'],
  [18, 'Xayrli kech'],
  [24, 'Xayrli tun'],
];
function greeting(): string {
  const hour = new Date().getHours();
  return HOUR_GREETINGS.find(([upTo]) => hour < upTo)?.[1] ?? 'Xayrli kun';
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const navigate = useNavigate();

  const quickActions = [
    { key: 'student', label: "O'quvchi qo'shish", icon: <UserAddOutlined />, to: '/students', show: hasPermission('students', 'CREATE') },
    { key: 'group', label: 'Guruh yaratish', icon: <GroupOutlined />, to: '/groups', show: hasPermission('groups', 'CREATE') },
    { key: 'payment', label: "To'lov qabul qilish", icon: <DollarOutlined />, to: '/payments', show: hasPermission('payments', 'CREATE') },
    { key: 'attendance', label: 'Davomat belgilash', icon: <CheckCircleOutlined />, to: '/attendance/student', show: hasPermission('student_attendance', 'CREATE') },
    { key: 'lead', label: "Lid qo'shish", icon: <UserOutlined />, to: '/leads', show: hasPermission('leads', 'CREATE') },
  ].filter((action) => action.show);

  const overviewQuery = useQuery({ queryKey: ['dashboard', 'overview'], queryFn: getDashboardOverview, staleTime: 30_000 });
  const todayQuery = useQuery({ queryKey: ['dashboard', 'today'], queryFn: getDashboardToday, staleTime: 30_000 });
  const chartsQuery = useQuery({ queryKey: ['dashboard', 'charts'], queryFn: getDashboardCharts, staleTime: 60_000 });

  const kpis = overviewQuery.data?.kpis;
  const actionRequired = overviewQuery.data?.actionRequired ?? [];
  const charts = chartsQuery.data;
  const today = todayQuery.data;

  if (overviewQuery.isError) {
    return <PageErrorState onRetry={() => overviewQuery.refetch()} title="Dashboard yuklanmadi" />;
  }

  const todayLabel = formatLongDate(new Date());

  return (
    <div className="dashboard-stagger">
      <div
        style={{
          marginBottom: 24,
          padding: '20px 24px',
          borderRadius: 12,
          border: '1px solid rgba(79,70,229,0.08)',
          background: palette.heroGradient,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {greeting()}, {user?.fullName}
          </Typography.Title>
          <Typography.Text type="secondary">
            {todayLabel} &middot; Ta'lim markazingizning bugungi holati quyida keltirilgan.
          </Typography.Text>
        </div>
        {quickActions.length > 0 && (
          <Space wrap size={8}>
            {quickActions.map((action) => (
              <Button key={action.key} icon={action.icon} onClick={() => navigate(action.to)}>
                {action.label}
              </Button>
            ))}
          </Space>
        )}
      </div>

      {/* ACTION REQUIRED */}
      <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
        <AlertOutlined style={{ color: palette.warning, marginInlineEnd: 8 }} />
        E'tibor talab qiladi
      </Typography.Title>
      {overviewQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 24 }} />
      ) : actionRequired.length === 0 ? (
        <Card style={{ marginBottom: 24 }}>
          <EmptyState title="Diqqat talab qiladigan narsa yo'q" description="Barcha muhim ko'rsatkichlar me'yorida." />
        </Card>
      ) : (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {actionRequired.map((item) => (
            <Col xs={12} sm={8} md={6} lg={4} key={item.key}>
              <StatCard icon={<ExclamationCircleOutlined />} color={palette.error} title={ACTION_REQUIRED_LABELS[item.key] ?? item.key} value={item.value} onClick={() => navigate(item.to)} />
            </Col>
          ))}
        </Row>
      )}

      {/* KPI GROUPS */}
      {overviewQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} style={{ marginBottom: 24 }} />
      ) : (
        kpis && (
          <>
            {(kpis.totalStudents !== undefined || kpis.activeGroups !== undefined || kpis.totalTeachers !== undefined) && (
              <>
                <Typography.Title level={5} style={{ marginBottom: 12 }}>
                  O'quvchilar va guruhlar
                </Typography.Title>
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  {kpis.totalStudents !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<UserOutlined />} color={palette.primary} title="Jami o'quvchilar" value={kpis.totalStudents} />
                    </Col>
                  )}
                  {kpis.activeStudents !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<CheckCircleOutlined />} color={palette.success} title="Faol o'quvchilar" value={kpis.activeStudents} />
                    </Col>
                  )}
                  {kpis.newStudentsThisMonth !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<UserAddOutlined />} color={palette.info} title="Bu oy yangi o'quvchilar" value={kpis.newStudentsThisMonth} />
                    </Col>
                  )}
                  {kpis.activeGroups !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<GroupOutlined />} color={palette.primary} title="Faol guruhlar" value={kpis.activeGroups} />
                    </Col>
                  )}
                  {kpis.totalTeachers !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<TeamOutlined />} color={palette.info} title="Jami o'qituvchilar" value={kpis.totalTeachers} />
                    </Col>
                  )}
                </Row>
              </>
            )}

            {(kpis.todaysLessons !== undefined || kpis.todaysAttendancePercentage !== undefined || kpis.absentStudentsToday !== undefined || kpis.upcomingExams !== undefined) && (
              <>
                <Typography.Title level={5} style={{ marginBottom: 12 }}>
                  Bugungi holat
                </Typography.Title>
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  {kpis.todaysLessons !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<CalendarOutlined />} color={palette.primary} title="Bugungi darslar" value={kpis.todaysLessons} />
                    </Col>
                  )}
                  {kpis.todaysAttendancePercentage !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<CheckCircleOutlined />} color={palette.success} title="Bugungi davomat" value={kpis.todaysAttendancePercentage} suffix="%" />
                    </Col>
                  )}
                  {kpis.absentStudentsToday !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard
                        icon={<ExclamationCircleOutlined />}
                        color={kpis.absentStudentsToday > 0 ? palette.error : palette.success}
                        title="Bugun kelmaganlar"
                        value={kpis.absentStudentsToday}
                      />
                    </Col>
                  )}
                  {kpis.upcomingExams !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<FormOutlined />} color={palette.info} title="Kutilayotgan imtihonlar" value={kpis.upcomingExams} />
                    </Col>
                  )}
                </Row>
              </>
            )}

            {(kpis.overdueTuition !== undefined ||
              kpis.outstandingStudentDebt !== undefined ||
              kpis.tuitionCollectedThisMonth !== undefined ||
              kpis.monthlyExpenses !== undefined ||
              kpis.monthlyProfit !== undefined ||
              kpis.payrollPayable !== undefined) && (
              <>
                <Typography.Title level={5} style={{ marginBottom: 12 }}>
                  Moliya va to'lovlar
                </Typography.Title>
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  {kpis.overdueTuition !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard
                        icon={<WalletOutlined />}
                        color={kpis.overdueTuition > 0 ? palette.error : palette.success}
                        title="Muddati o'tgan to'lov"
                        value={kpis.overdueTuition}
                        formatter={money}
                      />
                    </Col>
                  )}
                  {kpis.outstandingStudentDebt !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<WalletOutlined />} color={palette.warning} title="Qarzdorlik" value={kpis.outstandingStudentDebt} formatter={money} />
                    </Col>
                  )}
                  {kpis.tuitionCollectedThisMonth !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<DollarOutlined />} color={palette.success} title="Bu oy yig'ilgan to'lov" value={kpis.tuitionCollectedThisMonth} formatter={money} />
                    </Col>
                  )}
                  {kpis.monthlyExpenses !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<DollarOutlined />} color={palette.info} title="Oylik xarajatlar" value={kpis.monthlyExpenses} formatter={money} />
                    </Col>
                  )}
                  {kpis.monthlyProfit !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard
                        icon={<RiseOutlined />}
                        color={kpis.monthlyProfit >= 0 ? palette.success : palette.error}
                        title="Oylik foyda"
                        value={kpis.monthlyProfit}
                        formatter={money}
                      />
                    </Col>
                  )}
                  {kpis.payrollPayable !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<WalletOutlined />} color={palette.info} title="To'lanadigan ish haqi" value={kpis.payrollPayable} formatter={money} />
                    </Col>
                  )}
                </Row>
              </>
            )}

            {(kpis.newLeads !== undefined || kpis.leadConversionRate !== undefined) && (
              <>
                <Typography.Title level={5} style={{ marginBottom: 12 }}>
                  Lidlar
                </Typography.Title>
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  {kpis.newLeads !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<UserAddOutlined />} color={palette.primary} title="Yangi lidlar (bu oy)" value={kpis.newLeads} />
                    </Col>
                  )}
                  {kpis.leadConversionRate !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <StatCard icon={<RiseOutlined />} color={palette.success} title="Konversiya darajasi" value={kpis.leadConversionRate} suffix="%" />
                    </Col>
                  )}
                </Row>
              </>
            )}
          </>
        )
      )}

      {/* TODAY'S SCHEDULE */}
      <Card title="Bugungi dars jadvali" className="hover-lift" style={{ marginBottom: 16 }}>
        {todayQuery.isLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : !today || today.schedule.length === 0 ? (
          <EmptyState title="Bugun darslar rejalashtirilmagan" />
        ) : (
          <Table
            size="small"
            rowKey="id"
            dataSource={today.schedule}
            pagination={false}
            scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Vaqt', render: (_, r) => `${time(r.scheduledStart)}–${time(r.scheduledEnd)}` },
              { title: 'Guruh', render: (_, r) => r.group.name },
              { title: "O'qituvchi", render: (_, r) => r.teacherEmployee?.fullName ?? '—' },
              { title: 'Xona', render: (_, r) => r.classroom?.name ?? '—' },
              { title: 'Filial', render: (_, r) => r.branch.name },
              { title: 'Status', render: (_, r) => <Tag color={LESSON_STATUS_COLORS[r.status] ?? 'default'}>{LESSON_STATUS_LABELS[r.status] ?? r.status}</Tag> },
            ]}
          />
        )}
        {today?.attendance && (
          <div style={{ marginTop: 16 }}>
            <Typography.Text strong>Bugungi davomat: </Typography.Text>
            <Typography.Text>
              {today.attendance.present} keldi, {today.attendance.absent} kelmadi, {today.attendance.late} kechikdi ({today.attendance.attendancePercentage}%)
            </Typography.Text>
          </div>
        )}
      </Card>

      {/* CHARTS */}
      {chartsQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : charts && Object.keys(charts).length > 0 ? (
        <Row gutter={[16, 16]}>
          {charts.studentGrowth && (
            <ChartCard title="O'quvchilar o'sishi">
              <LineChart data={charts.studentGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Line type="monotone" dataKey="count" stroke={palette.primary} strokeWidth={2} />
              </LineChart>
            </ChartCard>
          )}
          {charts.enrollmentTrend && (
            <ChartCard title="Yozilishlar dinamikasi">
              <LineChart data={charts.enrollmentTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Line type="monotone" dataKey="count" stroke={palette.success} strokeWidth={2} />
              </LineChart>
            </ChartCard>
          )}
          {charts.tuitionCollection && (
            <ChartCard title="To'lovlar yig'ilishi">
              <BarChart data={charts.tuitionCollection}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} formatter={(v) => money(Number(v))} />
                <Bar dataKey="amount" fill={palette.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          )}
          {charts.incomeVsExpenses && (
            <ChartCard title="Daromad va xarajatlar">
              <BarChart data={charts.incomeVsExpenses}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} formatter={(v) => money(Number(v))} />
                <Legend />
                <Bar dataKey="income" name="Daromad" fill={palette.success} radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Xarajat" fill={palette.error} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          )}
          {charts.attendanceTrend && (
            <ChartCard title="Davomat dinamikasi (so'nggi 14 kun)">
              <LineChart data={charts.attendanceTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Line type="monotone" dataKey="attendancePercentage" stroke="#7C3AED" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartCard>
          )}
          {charts.academicPerformance && (
            <ChartCard title="Akademik ko'rsatkichlar">
              <LineChart data={charts.academicPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Line type="monotone" dataKey="averageScore" stroke={palette.info} strokeWidth={2} />
              </LineChart>
            </ChartCard>
          )}
          {charts.studentsByCourse && (
            <ChartCard title="Kurslar bo'yicha o'quvchilar">
              <BarChart data={charts.studentsByCourse}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" />
                <XAxis dataKey="courseName" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Bar dataKey="studentCount" fill={palette.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          )}
          {charts.studentsByBranch && (
            <ChartCard title="Filiallar bo'yicha o'quvchilar">
              <BarChart data={charts.studentsByBranch}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" />
                <XAxis dataKey="branchName" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Bar dataKey="count" fill={palette.success} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          )}
          {charts.groupCapacityUtilization && (
            <ChartCard title="Guruhlar to'ldirilishi (%)">
              <BarChart data={charts.groupCapacityUtilization}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Bar dataKey="utilizationPercentage" fill={palette.warning} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          )}
          {charts.leadConversionFunnel && (
            <ChartCard title="Lidlar konversiya voronkasi">
              <PieChart>
                <Pie data={charts.leadConversionFunnel} dataKey="count" nameKey="status" outerRadius={80} label>
                  {charts.leadConversionFunnel.map((entry, i) => (
                    <Cell key={entry.status} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Legend />
              </PieChart>
            </ChartCard>
          )}
        </Row>
      ) : (
        <Card>
          <EmptyState title="Ko'rsatiladigan diagramma yo'q" />
        </Card>
      )}
    </div>
  );
}
