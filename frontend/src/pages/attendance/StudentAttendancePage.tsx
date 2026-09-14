import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Row, Select, Space, Spin, Statistic, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listGroups } from '../../api/groups';
import { getStudent } from '../../api/students';
import { downloadStudentAttendanceCsv, getStudentAttendanceHistory } from '../../api/studentAttendance';
import { useAuthStore } from '../../store/auth.store';
import { ATTENDANCE_STATUS_COLORS, ATTENDANCE_STATUS_LABELS } from '../../utils/attendanceStatus';
import type { StudentAttendanceHistoryRecord } from '../../types';

export function StudentAttendancePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [groupId, setGroupId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[string, string] | undefined>();

  const canGroups = hasPermission('groups', 'VIEW');
  const studentQuery = useQuery({ queryKey: ['student', id], queryFn: () => getStudent(id!), enabled: !!id });
  const groupsQuery = useQuery({ queryKey: ['groups', { pageSize: 100, forAttendanceFilter: true }], queryFn: () => listGroups({ pageSize: 100 }), enabled: canGroups });
  const historyQuery = useQuery({
    queryKey: ['student-attendance-history', id, { groupId, dateRange }],
    queryFn: () => getStudentAttendanceHistory(id!, { groupId, dateFrom: dateRange?.[0], dateTo: dateRange?.[1] }),
    enabled: !!id,
  });

  async function handleExport() {
    try {
      await downloadStudentAttendanceCsv(id!, { groupId, dateFrom: dateRange?.[0], dateTo: dateRange?.[1] });
    } catch {
      message.error("Hisobotni yuklab bo'lmadi");
    }
  }

  if (studentQuery.isLoading || historyQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const student = studentQuery.data;
  const history = historyQuery.data;
  if (!student || !history) return null;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(`/students/${id}`)} style={{ marginBottom: 8 }}>
        O'quvchi profiliga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {student.fullName} — Davomat
            </Typography.Title>
            <Typography.Text type="secondary">{student.studentCode}</Typography.Text>
          </Col>
          <Col>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>
              CSV yuklash
            </Button>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={4}>
            <Statistic title="Jami darslar" value={history.eligibleLessons} />
          </Col>
          <Col span={4}>
            <Statistic title="Keldi" value={history.present} styles={{ content: { color: '#3f8600' } }} />
          </Col>
          <Col span={4}>
            <Statistic title="Kelmadi" value={history.absent} styles={{ content: { color: '#cf1322' } }} />
          </Col>
          <Col span={4}>
            <Statistic title="Kech qoldi" value={history.late} styles={{ content: { color: '#d4b106' } }} />
          </Col>
          <Col span={4}>
            <Statistic title="Sababli" value={history.excused} styles={{ content: { color: '#1677ff' } }} />
          </Col>
          <Col span={4}>
            <Statistic
              title="Davomat foizi"
              value={history.attendancePercentage}
              suffix="%"
              styles={{ content: { color: history.attendancePercentage >= 80 ? '#3f8600' : history.attendancePercentage >= 50 ? '#d4b106' : '#cf1322' } }}
            />
          </Col>
        </Row>
      </Card>

      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          {canGroups && (
            <Select
              placeholder="Guruh bo'yicha"
              allowClear
              style={{ width: 200 }}
              options={groupsQuery.data?.items.map((g) => ({ value: g.id, label: g.name }))}
              onChange={setGroupId}
            />
          )}
          <DatePicker.RangePicker onChange={(range) => setDateRange(range && range[0] && range[1] ? [range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')] : undefined)} />
        </Space>

        <Table<StudentAttendanceHistoryRecord>
          rowKey="lessonId"
          dataSource={history.records}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: 'Sana', dataIndex: 'scheduledStart', render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm') },
            { title: 'Guruh', render: (_, record) => record.group.name },
            { title: 'Mavzu', dataIndex: 'topic', render: (v: string | null) => v ?? '—' },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (v: StudentAttendanceHistoryRecord['status']) =>
                v === 'UNMARKED' ? <Tag>Belgilanmagan</Tag> : <Tag color={ATTENDANCE_STATUS_COLORS[v]}>{ATTENDANCE_STATUS_LABELS[v]}</Tag>,
            },
            { title: 'Izoh', dataIndex: 'notes', render: (v: string | null) => v ?? '—' },
          ]}
        />
      </Card>
    </div>
  );
}
