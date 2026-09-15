import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, Row, Skeleton, Statistic, Table, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getDashboardCharts, getDashboardOverview, getDashboardToday } from '../api/dashboard';
import { PageErrorState } from '../components/PageErrorState';
import { useAuthStore } from '../store/auth.store';
import { formatNumber } from '../utils/format';

const PIE_COLORS = ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];

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

function time(value: string) {
  return new Date(value).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

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

  return (
    <div>
      <Typography.Title level={3}>Xush kelibsiz, {user?.fullName}</Typography.Title>

      {/* ACTION REQUIRED */}
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        E'tibor talab qiladi
      </Typography.Title>
      {overviewQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 24 }} />
      ) : actionRequired.length === 0 ? (
        <Empty description="Hozircha diqqat talab qiladigan narsa yo'q" style={{ marginBottom: 24 }} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {actionRequired.map((item) => (
            <Col xs={12} sm={8} md={6} lg={4} key={item.key}>
              <Card hoverable styles={{ body: { padding: 16 } }} onClick={() => navigate(item.to)}>
                <Statistic title={ACTION_REQUIRED_LABELS[item.key] ?? item.key} value={item.value} styles={{ content: { color: '#f5222d' } }} />
              </Card>
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
              <Card title="O'quvchilar va guruhlar" style={{ marginBottom: 16 }}>
                <Row gutter={[16, 16]}>
                  {kpis.totalStudents !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Jami o'quvchilar" value={kpis.totalStudents} />
                    </Col>
                  )}
                  {kpis.activeStudents !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Faol o'quvchilar" value={kpis.activeStudents} styles={{ content: { color: '#3f8600' } }} />
                    </Col>
                  )}
                  {kpis.newStudentsThisMonth !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Bu oy yangi o'quvchilar" value={kpis.newStudentsThisMonth} />
                    </Col>
                  )}
                  {kpis.activeGroups !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Faol guruhlar" value={kpis.activeGroups} />
                    </Col>
                  )}
                  {kpis.totalTeachers !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Jami o'qituvchilar" value={kpis.totalTeachers} />
                    </Col>
                  )}
                </Row>
              </Card>
            )}

            {(kpis.todaysLessons !== undefined || kpis.todaysAttendancePercentage !== undefined || kpis.absentStudentsToday !== undefined || kpis.upcomingExams !== undefined) && (
              <Card title="Bugungi holat" style={{ marginBottom: 16 }}>
                <Row gutter={[16, 16]}>
                  {kpis.todaysLessons !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Bugungi darslar" value={kpis.todaysLessons} />
                    </Col>
                  )}
                  {kpis.todaysAttendancePercentage !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Bugungi davomat" value={kpis.todaysAttendancePercentage} suffix="%" />
                    </Col>
                  )}
                  {kpis.absentStudentsToday !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Bugun kelmaganlar" value={kpis.absentStudentsToday} styles={{ content: { color: kpis.absentStudentsToday > 0 ? '#f5222d' : undefined } }} />
                    </Col>
                  )}
                  {kpis.upcomingExams !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Kutilayotgan imtihonlar" value={kpis.upcomingExams} />
                    </Col>
                  )}
                </Row>
              </Card>
            )}

            {(kpis.overdueTuition !== undefined ||
              kpis.outstandingStudentDebt !== undefined ||
              kpis.tuitionCollectedThisMonth !== undefined ||
              kpis.monthlyExpenses !== undefined ||
              kpis.monthlyProfit !== undefined ||
              kpis.payrollPayable !== undefined) && (
              <Card title="Moliya va to'lovlar" style={{ marginBottom: 16 }}>
                <Row gutter={[16, 16]}>
                  {kpis.overdueTuition !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Muddati o'tgan to'lov" value={kpis.overdueTuition} formatter={(v) => money(Number(v))} styles={{ content: { color: kpis.overdueTuition! > 0 ? '#f5222d' : undefined } }} />
                    </Col>
                  )}
                  {kpis.outstandingStudentDebt !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Qarzdorlik" value={kpis.outstandingStudentDebt} formatter={(v) => money(Number(v))} styles={{ content: { color: '#faad14' } }} />
                    </Col>
                  )}
                  {kpis.tuitionCollectedThisMonth !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Bu oy yig'ilgan to'lov" value={kpis.tuitionCollectedThisMonth} formatter={(v) => money(Number(v))} styles={{ content: { color: '#3f8600' } }} />
                    </Col>
                  )}
                  {kpis.monthlyExpenses !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Oylik xarajatlar" value={kpis.monthlyExpenses} formatter={(v) => money(Number(v))} />
                    </Col>
                  )}
                  {kpis.monthlyProfit !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Oylik foyda" value={kpis.monthlyProfit} formatter={(v) => money(Number(v))} styles={{ content: { color: kpis.monthlyProfit! >= 0 ? '#3f8600' : '#f5222d' } }} />
                    </Col>
                  )}
                  {kpis.payrollPayable !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="To'lanadigan ish haqi" value={kpis.payrollPayable} formatter={(v) => money(Number(v))} />
                    </Col>
                  )}
                </Row>
              </Card>
            )}

            {(kpis.newLeads !== undefined || kpis.leadConversionRate !== undefined) && (
              <Card title="Lidlar" style={{ marginBottom: 16 }}>
                <Row gutter={[16, 16]}>
                  {kpis.newLeads !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Yangi lidlar (bu oy)" value={kpis.newLeads} />
                    </Col>
                  )}
                  {kpis.leadConversionRate !== undefined && (
                    <Col xs={12} sm={8} md={6} lg={4}>
                      <Statistic title="Konversiya darajasi" value={kpis.leadConversionRate} suffix="%" />
                    </Col>
                  )}
                </Row>
              </Card>
            )}
          </>
        )
      )}

      {/* TODAY'S SCHEDULE */}
      <Card title="Bugungi dars jadvali" style={{ marginBottom: 16 }}>
        {todayQuery.isLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : !today || today.schedule.length === 0 ? (
          <Empty description="Bugun darslar rejalashtirilmagan" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
            <Col xs={24} md={12}>
              <Card title="O'quvchilar o'sishi">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={charts.studentGrowth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#1677ff" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          )}
          {charts.enrollmentTrend && (
            <Col xs={24} md={12}>
              <Card title="Yozilishlar dinamikasi">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={charts.enrollmentTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#52c41a" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          )}
          {charts.tuitionCollection && (
            <Col xs={24} md={12}>
              <Card title="To'lovlar yig'ilishi">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={charts.tuitionCollection}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => money(Number(v))} />
                    <Bar dataKey="amount" fill="#1677ff" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          )}
          {charts.incomeVsExpenses && (
            <Col xs={24} md={12}>
              <Card title="Daromad va xarajatlar">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={charts.incomeVsExpenses}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => money(Number(v))} />
                    <Legend />
                    <Bar dataKey="income" name="Daromad" fill="#52c41a" />
                    <Bar dataKey="expenses" name="Xarajat" fill="#f5222d" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          )}
          {charts.attendanceTrend && (
            <Col xs={24} md={12}>
              <Card title="Davomat dinamikasi (so'nggi 14 kun)">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={charts.attendanceTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="attendancePercentage" stroke="#722ed1" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          )}
          {charts.academicPerformance && (
            <Col xs={24} md={12}>
              <Card title="Akademik ko'rsatkichlar">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={charts.academicPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="averageScore" stroke="#13c2c2" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          )}
          {charts.studentsByCourse && (
            <Col xs={24} md={12}>
              <Card title="Kurslar bo'yicha o'quvchilar">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={charts.studentsByCourse}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="courseName" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="studentCount" fill="#1677ff" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          )}
          {charts.studentsByBranch && (
            <Col xs={24} md={12}>
              <Card title="Filiallar bo'yicha o'quvchilar">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={charts.studentsByBranch}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="branchName" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#52c41a" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          )}
          {charts.groupCapacityUtilization && (
            <Col xs={24} md={12}>
              <Card title="Guruhlar to'ldirilishi (%)">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={charts.groupCapacityUtilization}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="utilizationPercentage" fill="#faad14" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          )}
          {charts.leadConversionFunnel && (
            <Col xs={24} md={12}>
              <Card title="Lidlar konversiya voronkasi">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={charts.leadConversionFunnel} dataKey="count" nameKey="status" outerRadius={80} label>
                      {charts.leadConversionFunnel.map((entry, i) => (
                        <Cell key={entry.status} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          )}
        </Row>
      ) : (
        <Empty description="Ko'rsatiladigan diagramma yo'q" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </div>
  );
}
