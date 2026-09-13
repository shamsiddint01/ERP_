import { DownloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Popconfirm, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBranches } from '../../api/branches';
import { listGroups } from '../../api/groups';
import { deleteStudentAttendance, downloadAttendanceSummaryCsv, getAttendanceSummary, listStudentAttendance } from '../../api/studentAttendance';
import { listTeachers } from '../../api/teachers';
import { EditAttendanceModal } from '../../components/EditAttendanceModal';
import { useAuthStore } from '../../store/auth.store';
import { ATTENDANCE_STATUS_COLORS, ATTENDANCE_STATUS_LABELS } from '../../utils/attendanceStatus';
import type { StudentAttendanceListItem, StudentAttendanceStatus } from '../../types';

export function StudentAttendanceOverviewPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [groupId, setGroupId] = useState<string | undefined>();
  const [teacherEmployeeId, setTeacherEmployeeId] = useState<string | undefined>();
  const [branchId, setBranchId] = useState<string | undefined>();
  const [status, setStatus] = useState<StudentAttendanceStatus | undefined>();
  const [dateRange, setDateRange] = useState<[string, string] | undefined>();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<StudentAttendanceListItem | undefined>();

  const groupsQuery = useQuery({ queryKey: ['groups', { pageSize: 100, forAttendanceOverview: true }], queryFn: () => listGroups({ pageSize: 100 }) });
  const teachersQuery = useQuery({ queryKey: ['teachers', { pageSize: 100, forAttendanceOverview: true }], queryFn: () => listTeachers({ pageSize: 100 }) });
  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100, forAttendanceOverview: true }], queryFn: () => listBranches({ pageSize: 100 }) });

  const filters = { groupId, teacherEmployeeId, branchId, status, dateFrom: dateRange?.[0], dateTo: dateRange?.[1] };

  const summaryQuery = useQuery({ queryKey: ['student-attendance-summary', filters], queryFn: () => getAttendanceSummary(filters) });
  const listQuery = useQuery({
    queryKey: ['student-attendance', { ...filters, page }],
    queryFn: () => listStudentAttendance({ ...filters, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  async function handleExport() {
    try {
      await downloadAttendanceSummaryCsv(filters);
    } catch {
      message.error("Hisobotni yuklab bo'lmadi");
    }
  }

  async function handleDelete(record: StudentAttendanceListItem) {
    try {
      await deleteStudentAttendance(record.id);
      message.success("Davomat yozuvi o'chirildi");
      queryClient.invalidateQueries({ queryKey: ['student-attendance'] });
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "O'chirib bo'lmadi");
    }
  }

  const canEdit = hasPermission('student_attendance', 'EDIT');
  const canDelete = hasPermission('student_attendance', 'DELETE');
  const summary = summaryQuery.data;

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          O'quvchilar davomati
        </Typography.Title>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>
          CSV yuklash
        </Button>
      </Space>

      {summary && (
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={4}>
              <Statistic title="Belgilangan" value={summary.totalMarked} />
            </Col>
            <Col span={4}>
              <Statistic title="Keldi" value={summary.present} styles={{ content: { color: '#3f8600' } }} />
            </Col>
            <Col span={4}>
              <Statistic title="Kelmadi" value={summary.absent} styles={{ content: { color: '#cf1322' } }} />
            </Col>
            <Col span={4}>
              <Statistic title="Kech qoldi" value={summary.late} styles={{ content: { color: '#d4b106' } }} />
            </Col>
            <Col span={4}>
              <Statistic title="Sababli" value={summary.excused} styles={{ content: { color: '#1677ff' } }} />
            </Col>
            <Col span={4}>
              <Statistic title="Davomat foizi" value={summary.markedAttendancePercentage} suffix="%" />
            </Col>
          </Row>
        </Card>
      )}

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Guruh"
          allowClear
          showSearch
          style={{ width: 180 }}
          filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
          options={groupsQuery.data?.items.map((g) => ({ value: g.id, label: g.name }))}
          onChange={(v) => {
            setGroupId(v);
            setPage(1);
          }}
        />
        <Select
          placeholder="O'qituvchi"
          allowClear
          showSearch
          style={{ width: 180 }}
          filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
          options={teachersQuery.data?.items.map((t) => ({ value: t.employeeId, label: t.employee.fullName }))}
          onChange={(v) => {
            setTeacherEmployeeId(v);
            setPage(1);
          }}
        />
        <Select
          placeholder="Filial"
          allowClear
          style={{ width: 160 }}
          options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))}
          onChange={(v) => {
            setBranchId(v);
            setPage(1);
          }}
        />
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 160 }}
          options={Object.entries(ATTENDANCE_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <DatePicker.RangePicker
          onChange={(range) => {
            setDateRange(range && range[0] && range[1] ? [range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')] : undefined);
            setPage(1);
          }}
        />
      </Space>

      <Table<StudentAttendanceListItem>
        rowKey="id"
        loading={listQuery.isLoading}
        dataSource={listQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: listQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Sana', render: (_, record) => dayjs(record.lesson.scheduledStart).format('DD.MM.YYYY HH:mm') },
          {
            title: 'Guruh',
            render: (_, record) => (
              <Typography.Link onClick={() => navigate(`/groups/${record.lesson.groupId}`)}>{record.lesson.group.name}</Typography.Link>
            ),
          },
          {
            title: "O'quvchi",
            render: (_, record) => (
              <Typography.Link onClick={() => navigate(`/students/${record.studentId}/attendance`)}>{record.student.fullName}</Typography.Link>
            ),
          },
          { title: "O'qituvchi", render: (_, record) => record.lesson.teacherEmployee?.fullName ?? '—' },
          { title: 'Status', dataIndex: 'status', render: (v: StudentAttendanceStatus) => <Tag color={ATTENDANCE_STATUS_COLORS[v]}>{ATTENDANCE_STATUS_LABELS[v]}</Tag> },
          { title: 'Izoh', dataIndex: 'notes', render: (v: string | null) => v ?? '—' },
          {
            title: 'Amallar',
            render: (_, record) => (
              <Space>
                {canEdit && (
                  <Button size="small" onClick={() => setEditing(record)}>
                    Tuzatish
                  </Button>
                )}
                {canDelete && (
                  <Popconfirm title="Ushbu davomat yozuvini o'chirishni tasdiqlaysizmi?" onConfirm={() => handleDelete(record)}>
                    <Button size="small" danger>
                      O'chirish
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      {editing && <EditAttendanceModal open={!!editing} onClose={() => setEditing(undefined)} record={editing} />}
    </div>
  );
}
