import {
  ArrowRightOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  FormOutlined,
  GroupOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserSwitchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Card, Col, Row, Skeleton, Table, Tag, Typography } from 'antd';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getDashboardCharts, getDashboardOverview, getDashboardToday } from '../api/dashboard';
import { EmptyState } from '../components/EmptyState';
import { PageErrorState } from '../components/PageErrorState';
import { StatCard } from '../components/StatCard';
import { attendanceChartColors, chartAxisTick, chartGridStroke, chartTooltipLabelStyle, chartTooltipStyle, palette } from '../theme';
import { useAuthStore } from '../store/auth.store';
import { avatarColor } from '../utils/avatarColor';
import { formatNumber } from '../utils/format';
import type { PaymentMethod } from '../types';

const LESSON_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Rejalashtirilgan',
  IN_PROGRESS: 'Davom etmoqda',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
  NO_SHOW: 'Kelinmadi',
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
  absentStudentsToday: "Bugun kelmagan o'quvchilar",
  upcomingExams: 'Kutilayotgan testlar',
  unreadNotifications: "O'qilmagan bildirishnomalar",
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Naqd',
  CARD: 'Karta',
  BANK_TRANSFER: "O'tkazma",
  ONLINE: 'Onlayn',
  CHEQUE: 'Chek',
};

const MONTH_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];

// `toLocaleDateString('uz-UZ', ...)` falls back to broken output in browsers
// without full uz-UZ CLDR data — manual lookups are the only reliable way.
function formatLongDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()}-${MONTHS[date.getMonth()]}`;
}

/** "2026-09" → "Sen" */
function monthLabel(key: string): string {
  return MONTH_SHORT[Number(key.slice(5, 7)) - 1] ?? key;
}

function time(value: string) {
  return new Date(value).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

/** Compact money for big headline figures: 96 000 000 → "96 mln". */
function compactMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${formatNumber(value / 1_000_000_000, 1)} mlrd`;
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} mln`;
  if (abs >= 1_000) return `${formatNumber(value / 1_000, 0)} ming`;
  return formatNumber(value, 0);
}

const money = (value: number) => formatNumber(value, 0);

const HOUR_GREETINGS: [number, string][] = [
  [5, 'Xayrli tun'],
  [12, 'Xayrli tong'],
  [18, 'Xayrli kun'],
  [24, 'Xayrli kech'],
];
function greeting(): string {
  const hour = new Date().getHours();
  return HOUR_GREETINGS.find(([upTo]) => hour < upTo)?.[1] ?? 'Xayrli kun';
}

function Panel({ title, extra, children, bodyStyle }: { title: string; extra?: ReactNode; children: ReactNode; bodyStyle?: CSSProperties }) {
  return (
    <Card title={title} extra={extra} style={{ height: '100%' }} styles={{ body: bodyStyle }}>
      {children}
    </Card>
  );
}

function ChartPanel({ title, children, height = 220 }: { title: string; children: ReactNode; height?: number }) {
  return (
    <Col xs={24} lg={12}>
      <Panel title={title}>
        <ResponsiveContainer width="100%" height={height}>
          {children as ReactElement}
        </ResponsiveContainer>
      </Panel>
    </Col>
  );
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const navigate = useNavigate();

  const overviewQuery = useQuery({ queryKey: ['dashboard', 'overview'], queryFn: getDashboardOverview, staleTime: 30_000 });
  const todayQuery = useQuery({ queryKey: ['dashboard', 'today'], queryFn: getDashboardToday, staleTime: 30_000 });
  const chartsQuery = useQuery({ queryKey: ['dashboard', 'charts'], queryFn: getDashboardCharts, staleTime: 60_000 });

  const kpis = overviewQuery.data?.kpis;
  const actionRequired = overviewQuery.data?.actionRequired ?? [];
  const charts = chartsQuery.data;
  const today = todayQuery.data;

  if (overviewQuery.isError) {
    return <PageErrorState onRetry={() => overviewQuery.refetch()} title="Bosh sahifa yuklanmadi" />;
  }

  const canFinance = kpis?.tuitionCollectedThisMonth !== undefined;
  const quickActions = [
    { key: 'payment', label: "To'lov qabul qilish", icon: <DollarOutlined />, to: '/payments', primary: true, show: hasPermission('payments', 'CREATE') },
    { key: 'student', label: "O'quvchi qo'shish", icon: <UserAddOutlined />, to: '/students', primary: false, show: hasPermission('students', 'CREATE') },
    { key: 'attendance', label: 'Davomat', icon: <CheckCircleOutlined />, to: '/attendance', primary: false, show: hasPermission('lessons', 'VIEW') },
  ].filter((action) => action.show);

  const kpiTiles = kpis
    ? [
        kpis.activeStudents !== undefined && { key: 'students', icon: <TeamOutlined />, title: "Faol o'quvchilar", value: kpis.activeStudents, color: palette.primary, to: '/students' },
        kpis.activeGroups !== undefined && { key: 'groups', icon: <GroupOutlined />, title: 'Faol guruhlar', value: kpis.activeGroups, color: palette.ember, to: '/groups' },
        kpis.totalTeachers !== undefined && { key: 'teachers', icon: <UserSwitchOutlined />, title: "O'qituvchilar", value: kpis.totalTeachers, color: palette.info, to: '/teachers' },
        kpis.todaysLessons !== undefined && { key: 'lessons', icon: <CalendarOutlined />, title: 'Bugungi darslar', value: kpis.todaysLessons, color: palette.success, to: '/attendance' },
        kpis.upcomingExams !== undefined && { key: 'exams', icon: <FormOutlined />, title: 'Kutilayotgan testlar', value: kpis.upcomingExams, color: '#B48CFF', to: '/exams' },
        kpis.newStudentsThisMonth !== undefined && { key: 'new', icon: <UserAddOutlined />, title: "Bu oy yangi o'quvchilar", value: kpis.newStudentsThisMonth, color: palette.primary, to: '/students' },
      ].filter((tile): tile is { key: string; icon: ReactElement; title: string; value: number; color: string; to: string } => Boolean(tile))
    : [];

  const attendance = today?.attendance;
  const attendanceSlices = attendance
    ? [
        { key: 'present', name: 'Keldi', value: attendance.present, color: attendanceChartColors.present },
        { key: 'late', name: 'Kechikdi', value: attendance.late, color: attendanceChartColors.late },
        { key: 'absent', name: 'Kelmadi', value: attendance.absent, color: attendanceChartColors.absent },
        { key: 'excused', name: 'Sababli', value: attendance.excused, color: attendanceChartColors.excused },
      ]
    : [];

  return (
    <div className="dashboard-stagger">
      {/* HERO — greeting, this month's collections, debt card */}
      <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
        <Col xs={24} xl={canFinance ? 16 : 24}>
          <Card style={{ height: '100%', background: palette.heroGradient, overflow: 'hidden' }} styles={{ body: { padding: 28 } }}>
            <div className="eyebrow">{formatLongDate(new Date())}</div>
            <Typography.Title level={3} style={{ margin: '6px 0 0' }}>
              {greeting()}, {user?.fullName}
            </Typography.Title>
            {overviewQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 1 }} style={{ marginTop: 16 }} />
            ) : (
              canFinance && (
                <div style={{ marginTop: 22 }}>
                  <div className="eyebrow">Bu oy yig'ilgan to'lovlar</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span className="text-gradient" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                      {money(kpis!.tuitionCollectedThisMonth!)}
                    </span>
                    <span style={{ color: palette.textSecondary, fontWeight: 600 }}>so'm</span>
                  </div>
                </div>
              )
            )}
            {quickActions.length > 0 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
                {quickActions.map((action) => (
                  <Button key={action.key} type={action.primary ? 'primary' : 'default'} shape="round" icon={action.icon} onClick={() => navigate(action.to)}>
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </Card>
        </Col>
        {canFinance && (
          <Col xs={24} xl={8}>
            <div
              onClick={() => navigate('/payments?tab=balances')}
              className="hover-lift"
              style={{
                height: '100%',
                minHeight: 200,
                cursor: 'pointer',
                borderRadius: 16,
                padding: 24,
                background: palette.accentGradient,
                color: '#1B1C20',
                boxShadow: '0 18px 40px rgba(239, 91, 52, 0.28)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.14)' }} />
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.75 }}>Umumiy qarzdorlik</div>
              <div>
                <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{compactMoney(kpis!.outstandingStudentDebt ?? 0)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8, marginTop: 6 }}>
                  Muddati o'tgan: {money(kpis!.overdueTuition ?? 0)} so'm
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                Qarzdorlar ro'yxati <ArrowRightOutlined />
              </div>
            </div>
          </Col>
        )}
      </Row>

      {/* KPI STRIP */}
      {overviewQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 2 }} style={{ marginBottom: 20 }} />
      ) : (
        kpiTiles.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
            {kpiTiles.map((tile) => (
              <StatCard key={tile.key} icon={tile.icon} title={tile.title} value={tile.value} color={tile.color} onClick={() => navigate(tile.to)} />
            ))}
          </div>
        )
      )}

      {/* PAYMENTS TREND + TODAY'S ATTENDANCE */}
      <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
        {charts?.tuitionCollection && (
          <Col xs={24} xl={16}>
            <Panel title="To'lovlar dinamikasi" extra={<span className="eyebrow">So'nggi 6 oy</span>}>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={charts.tuitionCollection} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="paymentsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={palette.ember} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={palette.ember} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="paymentsStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={palette.ember} />
                      <stop offset="100%" stopColor={palette.primary} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={chartGridStroke} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={chartAxisTick} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v: number) => compactMoney(v)} tick={chartAxisTick} axisLine={false} tickLine={false} width={64} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartTooltipLabelStyle}
                    labelFormatter={(v) => monthLabel(String(v))}
                    formatter={(v) => [`${money(Number(v))} so'm`, "Yig'ilgan"]}
                    cursor={{ stroke: palette.primary, strokeOpacity: 0.4 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="url(#paymentsStroke)"
                    strokeWidth={2.5}
                    fill="url(#paymentsFill)"
                    dot={false}
                    activeDot={{ r: 5, fill: palette.primary, stroke: palette.surface, strokeWidth: 2 }}
                    style={{ filter: 'drop-shadow(0 4px 10px rgba(239, 91, 52, 0.45))' }}
                  />
                </AreaChart>
              </ResponsiveContainer>

              {today && today.recentPayments.length > 0 && (
                <div style={{ marginTop: 12, borderTop: `1px solid ${palette.border}` }}>
                  {today.recentPayments.map((payment) => (
                    <div
                      key={payment.id}
                      onClick={() => payment.studentId && navigate(`/students/${payment.studentId}?tab=finance`)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                        alignItems: 'center',
                        gap: 16,
                        padding: '10px 4px',
                        borderBottom: `1px solid ${palette.border}`,
                        cursor: payment.studentId ? 'pointer' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <Avatar size={30} style={{ background: avatarColor(payment.studentName ?? '?'), fontSize: 13, flexShrink: 0 }}>
                          {(payment.studentName ?? '?').charAt(0)}
                        </Avatar>
                        <div style={{ minWidth: 0 }}>
                          <Typography.Text ellipsis style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>
                            {payment.studentName ?? '—'}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            {new Date(payment.paidAt ?? payment.createdAt).toLocaleDateString('uz-UZ')} · {METHOD_LABELS[payment.method]}
                          </Typography.Text>
                        </div>
                      </div>
                      <Tag color={payment.status === 'COMPLETED' ? 'green' : payment.status === 'REFUNDED' ? 'default' : 'gold'} style={{ marginInlineEnd: 0 }}>
                        {payment.status === 'COMPLETED' ? "To'langan" : payment.status === 'REFUNDED' ? 'Qaytarilgan' : 'Kutilmoqda'}
                      </Tag>
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 110, textAlign: 'right' }}>{money(payment.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </Col>
        )}

        {attendance && (
          <Col xs={24} xl={charts?.tuitionCollection ? 8 : 24}>
            <Panel title="Bugungi davomat">
              {attendance.total === 0 ? (
                <EmptyState title="Bugun hali davomat belgilanmagan" />
              ) : (
                <>
                  <div style={{ position: 'relative' }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={attendanceSlices} dataKey="value" nameKey="name" innerRadius={70} outerRadius={92} paddingAngle={2} stroke={palette.surface} strokeWidth={2}>
                          {attendanceSlices.map((slice) => (
                            <Cell key={slice.key} fill={slice.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={{ color: palette.text }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <span className="eyebrow" style={{ fontSize: 10 }}>
                        Davomat
                      </span>
                      <span style={{ fontSize: 28, fontWeight: 800 }}>{attendance.attendancePercentage}%</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    {attendanceSlices.map((slice) => (
                      <div key={slice.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: slice.color, flexShrink: 0 }} />
                        <span style={{ color: palette.textSecondary }}>{slice.name}</span>
                        <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{slice.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Panel>
          </Col>
        )}
      </Row>

      {/* TODAY'S SCHEDULE + ACTION REQUIRED */}
      <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
        <Col xs={24} xl={actionRequired.length > 0 ? 16 : 24}>
          <Panel title="Bugungi dars jadvali" bodyStyle={{ paddingTop: 8 }}>
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
                onRow={(record) => ({ onClick: () => navigate(`/lessons/${record.id}`), style: { cursor: 'pointer' } })}
                columns={[
                  { title: 'Vaqt', render: (_, r) => <span style={{ fontWeight: 600 }}>{`${time(r.scheduledStart)}–${time(r.scheduledEnd)}`}</span> },
                  { title: 'Guruh', render: (_, r) => r.group.name },
                  { title: "O'qituvchi", render: (_, r) => r.teacherEmployee?.fullName ?? '—' },
                  { title: 'Xona', render: (_, r) => r.classroom?.name ?? '—' },
                  { title: 'Status', render: (_, r) => <Tag color={LESSON_STATUS_COLORS[r.status] ?? 'default'}>{LESSON_STATUS_LABELS[r.status] ?? r.status}</Tag> },
                ]}
              />
            )}
          </Panel>
        </Col>
        {actionRequired.length > 0 && (
          <Col xs={24} xl={8}>
            <Panel title="E'tibor talab qiladi">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {actionRequired.map((item) => (
                  <div
                    key={item.key}
                    className="hover-lift"
                    onClick={() => navigate(item.to)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      cursor: 'pointer',
                      background: palette.surfaceRaised,
                      border: `1px solid ${palette.border}`,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: item.key === 'overdueTuition' || item.key === 'absentStudentsToday' ? palette.error : palette.primary,
                        background: item.key === 'overdueTuition' || item.key === 'absentStudentsToday' ? 'rgba(242,92,74,0.12)' : 'rgba(245,165,36,0.12)',
                      }}
                    >
                      {item.key === 'overdueTuition' ? <WarningOutlined /> : <ExclamationCircleOutlined />}
                    </div>
                    <span style={{ flex: 1, fontSize: 13, color: palette.textSecondary }}>{ACTION_REQUIRED_LABELS[item.key] ?? item.key}</span>
                    <span style={{ fontWeight: 700 }}>{item.key === 'overdueTuition' ? compactMoney(item.value) : item.value}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </Col>
        )}
      </Row>

      {/* SECONDARY CHARTS */}
      {chartsQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        charts && (
          <Row gutter={[20, 20]}>
            {charts.studentGrowth && (
              <ChartPanel title="Yangi o'quvchilar">
                <BarChart data={charts.studentGrowth} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={chartGridStroke} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={chartAxisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} labelFormatter={(v) => monthLabel(String(v))} formatter={(v) => [v, "O'quvchilar"]} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="count" fill={palette.primary} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ChartPanel>
            )}
            {charts.attendanceTrend && !charts.attendanceTrend.some((d) => d.attendancePercentage !== null) && (
              <Col xs={24} lg={12}>
                <Panel title="Davomat dinamikasi (14 kun)">
                  <EmptyState title="So'nggi 14 kunda davomat belgilanmagan" />
                </Panel>
              </Col>
            )}
            {charts.attendanceTrend && charts.attendanceTrend.some((d) => d.attendancePercentage !== null) && (
              <ChartPanel title="Davomat dinamikasi (14 kun)">
                <LineChart data={charts.attendanceTrend} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={chartGridStroke} />
                  <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(8)} tick={chartAxisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} formatter={(v) => [v === null ? "Ma'lumot yo'q" : `${v}%`, 'Davomat']} cursor={{ stroke: palette.primary, strokeOpacity: 0.4 }} />
                  <Line type="monotone" dataKey="attendancePercentage" stroke={palette.success} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5, stroke: palette.surface, strokeWidth: 2 }} connectNulls={false} />
                </LineChart>
              </ChartPanel>
            )}
            {charts.studentsByCourse && (
              <ChartPanel title="Kurslar bo'yicha o'quvchilar">
                <BarChart data={charts.studentsByCourse} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={chartGridStroke} />
                  <XAxis type="number" tick={chartAxisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="courseName" tick={chartAxisTick} axisLine={false} tickLine={false} width={120} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} formatter={(v) => [v, "O'quvchilar"]} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="studentCount" fill={palette.primary} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ChartPanel>
            )}
            {charts.groupCapacityUtilization && (
              <ChartPanel title="Guruhlar to'ldirilishi" height={Math.max(160, charts.groupCapacityUtilization.length * 40)}>
                <BarChart data={charts.groupCapacityUtilization} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={chartGridStroke} />
                  <XAxis type="number" tick={chartAxisTick} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                  <YAxis type="category" dataKey="name" tick={chartAxisTick} axisLine={false} tickLine={false} width={150} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartTooltipLabelStyle}
                    formatter={(v, _name, item) => [`${v}% (${item.payload.enrolledCount}/${item.payload.capacity})`, "To'ldirilgan"]}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  <Bar dataKey="utilizationPercentage" fill={palette.ember} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ChartPanel>
            )}
            {charts.academicPerformance && (
              <ChartPanel title="O'rtacha test natijasi">
                <LineChart data={charts.academicPerformance} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={chartGridStroke} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={chartAxisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} labelFormatter={(v) => monthLabel(String(v))} formatter={(v) => [v, "O'rtacha ball"]} cursor={{ stroke: palette.primary, strokeOpacity: 0.4 }} />
                  <Line type="monotone" dataKey="averageScore" stroke={palette.info} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5, stroke: palette.surface, strokeWidth: 2 }} connectNulls={false} />
                </LineChart>
              </ChartPanel>
            )}
          </Row>
        )
      )}
    </div>
  );
}
