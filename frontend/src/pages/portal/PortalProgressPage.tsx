import { BookOutlined, CheckCircleOutlined, FormOutlined, TrophyOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Progress, Row, Skeleton, Typography } from 'antd';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getPortalProgress } from '../../api/portal';
import { EmptyState } from '../../components/EmptyState';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { attendanceChartColors, chartAxisTick, chartGridStroke, chartTooltipLabelStyle, chartTooltipStyle, palette } from '../../theme';
import { formatDate } from '../../utils/format';

export function PortalProgressPage() {
  const progressQuery = useQuery({ queryKey: ['portal', 'progress'], queryFn: getPortalProgress });

  if (progressQuery.isError) return <PageErrorState onRetry={() => progressQuery.refetch()} />;
  if (progressQuery.isLoading || !progressQuery.data) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  const { attendance, homework, totalExams, averagePercentage, passRate, courseProgress, recentExams } = progressQuery.data;
  const examTrend = [...recentExams]
    .sort((a, b) => a.examDate.localeCompare(b.examDate))
    .map((r) => ({ label: formatDate(r.examDate), title: r.examTitle, percentage: Math.round(r.percentage) }));

  const attendanceRows = [
    { key: 'present', label: 'Keldi', value: attendance.present, color: attendanceChartColors.present },
    { key: 'late', label: 'Kechikdi', value: attendance.late, color: attendanceChartColors.late },
    { key: 'absent', label: 'Kelmadi', value: attendance.absent, color: attendanceChartColors.absent },
    { key: 'excused', label: 'Sababli', value: attendance.excused, color: attendanceChartColors.excused },
  ];
  const marked = attendanceRows.reduce((sum, r) => sum + r.value, 0);

  return (
    <div>
      <PageHeader title="Ko'rsatkichlarim" subtitle="Davomat, imtihon va uy ishi natijalaringiz" />

      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard icon={<CheckCircleOutlined />} title="Davomat" value={attendance.attendancePercentage} suffix="%" color={palette.success} />
        <StatCard icon={<FormOutlined />} title="Imtihon o'rtacha" value={totalExams ? averagePercentage : 0} suffix={totalExams ? '%' : undefined} formatter={(v) => (totalExams ? String(v) : '—')} color={palette.primary} />
        <StatCard
          icon={<TrophyOutlined />}
          title="Imtihondan o'tish"
          value={passRate}
          suffix={totalExams ? '%' : undefined}
          formatter={(v) => (totalExams ? String(v) : '—')}
          color={palette.ember}
          description={`${totalExams} ta imtihon`}
        />
        <StatCard
          icon={<BookOutlined />}
          title="Uy ishi bajarildi"
          value={homework.submitted}
          formatter={(v) => `${v} / ${homework.assigned}`}
          color={palette.info}
          description={homework.averagePercentage !== null ? `O'rtacha ball: ${homework.averagePercentage}%` : undefined}
        />
      </div>

      <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
        <Col xs={24} lg={14}>
          <Card title="Imtihon natijalari dinamikasi" style={{ height: '100%' }}>
            {examTrend.length === 0 ? (
              <EmptyState title="Hali imtihon natijasi yo'q" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={examTrend} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={chartGridStroke} />
                  <XAxis dataKey="label" tick={chartAxisTick} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} unit="%" tick={chartAxisTick} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartTooltipLabelStyle}
                    formatter={(v, _n, item) => [`${v}%`, item.payload.title]}
                    cursor={{ stroke: palette.primary, strokeOpacity: 0.4 }}
                  />
                  <Line type="monotone" dataKey="percentage" stroke={palette.primary} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6, stroke: palette.surface, strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Davomat" style={{ height: '100%' }}>
            {marked === 0 ? (
              <EmptyState title="Hali davomat belgilanmagan" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {attendanceRows.map((row) => (
                  <div key={row.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ color: palette.textSecondary }}>{row.label}</span>
                      <span style={{ fontWeight: 700 }}>{row.value} ta dars</span>
                    </div>
                    <Progress percent={Math.round((row.value / marked) * 100)} strokeColor={row.color} showInfo={false} />
                  </div>
                ))}
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Jami {attendance.eligibleLessons} ta dars, {marked} tasida davomat belgilangan
                </Typography.Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Kurs bo'yicha o'zlashtirish">
        {courseProgress.length === 0 ? (
          <EmptyState title="Faol kurs yo'q" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {courseProgress.map((course) => (
              <div key={course.enrollmentId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                  <span>
                    <span style={{ fontWeight: 600 }}>{course.courseName}</span>
                    <span style={{ color: palette.textMuted }}> · {course.groupName}</span>
                  </span>
                  <span style={{ color: palette.textSecondary, fontSize: 13 }}>
                    {course.completedLessons} / {course.totalLessons} dars
                  </span>
                </div>
                <Progress percent={Math.round(course.progressPercentage)} strokeColor={{ '0%': palette.ember, '100%': palette.primary }} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
