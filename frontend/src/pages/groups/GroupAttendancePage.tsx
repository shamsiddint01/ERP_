import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Progress, Row, Space, Spin, Statistic, Table, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { downloadGroupAttendanceCsv, getGroupAttendanceSummary } from '../../api/studentAttendance';
import type { GroupAttendanceStudentRow } from '../../types';

export function GroupAttendancePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [dateRange, setDateRange] = useState<[string, string] | undefined>();

  const summaryQuery = useQuery({
    queryKey: ['group-attendance', id, { dateRange }],
    queryFn: () => getGroupAttendanceSummary(id!, { dateFrom: dateRange?.[0], dateTo: dateRange?.[1] }),
    enabled: !!id,
  });

  async function handleExport() {
    try {
      await downloadGroupAttendanceCsv(id!, { dateFrom: dateRange?.[0], dateTo: dateRange?.[1] });
    } catch {
      message.error("Hisobotni yuklab bo'lmadi");
    }
  }

  if (summaryQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const summary = summaryQuery.data;
  if (!summary) return null;

  const groupAveragePercentage = summary.students.length
    ? Math.round((summary.students.reduce((sum, s) => sum + s.attendancePercentage, 0) / summary.students.length) * 100) / 100
    : 0;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(`/groups/${id}`)} style={{ marginBottom: 8 }}>
        Guruhga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {summary.groupName} — Davomat hisobot
            </Typography.Title>
          </Col>
          <Col>
            <Space>
              <DatePicker.RangePicker
                onChange={(range) => setDateRange(range && range[0] && range[1] ? [range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')] : undefined)}
              />
              <Button icon={<DownloadOutlined />} onClick={handleExport}>
                CSV yuklash
              </Button>
            </Space>
          </Col>
        </Row>
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={8}>
            <Statistic title="Jami darslar" value={summary.totalLessons} />
          </Col>
          <Col span={8}>
            <Statistic title="O'quvchilar soni" value={summary.students.length} />
          </Col>
          <Col span={8}>
            <Statistic title="O'rtacha davomat" value={groupAveragePercentage} suffix="%" />
          </Col>
        </Row>
      </Card>

      <Card>
        <Table<GroupAttendanceStudentRow>
          rowKey={(record) => record.student.id}
          dataSource={summary.students}
          pagination={false}
          onRow={(record) => ({ onClick: () => navigate(`/students/${record.student.id}/attendance`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Kod', render: (_, record) => record.student.studentCode },
            { title: "F.I.Sh.", render: (_, record) => record.student.fullName },
            { title: 'Jami', dataIndex: 'eligibleLessons' },
            { title: 'Keldi', dataIndex: 'present' },
            { title: 'Kelmadi', dataIndex: 'absent' },
            { title: 'Kech qoldi', dataIndex: 'late' },
            { title: 'Sababli', dataIndex: 'excused' },
            { title: 'Belgilanmagan', dataIndex: 'unmarked' },
            {
              title: 'Davomat foizi',
              dataIndex: 'attendancePercentage',
              render: (v: number) => <Progress percent={v} size="small" status={v < 50 ? 'exception' : undefined} style={{ width: 140 }} />,
            },
          ]}
        />
      </Card>
    </div>
  );
}
