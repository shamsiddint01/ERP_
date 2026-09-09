import { DownloadOutlined, LoginOutlined, LogoutOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Modal, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { checkIn, checkOut, downloadAttendanceReport, getAttendanceOverview, listAttendance } from '../../api/attendance';
import { listDepartments } from '../../api/departments';
import { listEmployees } from '../../api/employees';
import { useAuthStore } from '../../store/auth.store';
import type { AttendanceRecordItem, AttendanceStatus } from '../../types';

const { RangePicker } = DatePicker;

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: 'green',
  LATE: 'gold',
  ABSENT: 'red',
  HALF_DAY: 'blue',
  ON_LEAVE: 'purple',
  HOLIDAY: 'default',
};

function CheckInOutModal({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: 'in' | 'out' }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState<string | undefined>();

  const employeesQuery = useQuery({ queryKey: ['employees', { pageSize: 100, status: 'ACTIVE' }], queryFn: () => listEmployees({ pageSize: 100, status: 'ACTIVE' }), enabled: open });

  const mutation = useMutation({
    mutationFn: () => (mode === 'in' ? checkIn(employeeId!) : checkOut(employeeId!)),
    onSuccess: () => {
      message.success(mode === 'in' ? 'Kelish belgilandi' : 'Ketish belgilandi');
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-overview'] });
      setEmployeeId(undefined);
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Amalni bajarib bo‘lmadi');
    },
  });

  return (
    <Modal
      title={mode === 'in' ? 'Kelishni belgilash' : 'Ketishni belgilash'}
      open={open}
      onCancel={onClose}
      onOk={() => mutation.mutate()}
      confirmLoading={mutation.isPending}
      okButtonProps={{ disabled: !employeeId }}
      destroyOnHidden
    >
      <Select
        style={{ width: '100%' }}
        placeholder="Xodimni tanlang"
        loading={employeesQuery.isLoading}
        value={employeeId}
        onChange={setEmployeeId}
        options={employeesQuery.data?.items.map((e) => ({ value: e.id, label: `${e.employeeCode} — ${e.fullName}` }))}
        showSearch
        filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
      />
    </Modal>
  );
}

export function AttendancePage() {
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [status, setStatus] = useState<AttendanceStatus | undefined>();
  const [range, setRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [page, setPage] = useState(1);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);

  const from = range?.[0]?.format('YYYY-MM-DD');
  const to = range?.[1]?.format('YYYY-MM-DD');

  const overviewQuery = useQuery({ queryKey: ['attendance-overview'], queryFn: getAttendanceOverview });
  const departmentsQuery = useQuery({ queryKey: ['departments', { pageSize: 100 }], queryFn: () => listDepartments({ pageSize: 100 }) });
  const attendanceQuery = useQuery({
    queryKey: ['attendance', { departmentId, status, from, to, page }],
    queryFn: () => listAttendance({ departmentId, status, from, to, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  async function handleExport(type: 'late' | 'absence' | 'overtime') {
    try {
      await downloadAttendanceReport({ type, from, to, departmentId });
    } catch {
      message.error('Eksport qilib bo‘lmadi');
    }
  }

  const canCreate = hasPermission('attendance', 'CREATE');
  const canEdit = hasPermission('attendance', 'EDIT');

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Davomat
        </Typography.Title>
        <Space>
          {canCreate && (
            <Button icon={<LoginOutlined />} onClick={() => setCheckInOpen(true)}>
              Kelish
            </Button>
          )}
          {canEdit && (
            <Button icon={<LogoutOutlined />} onClick={() => setCheckOutOpen(true)}>
              Ketish
            </Button>
          )}
        </Space>
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic title="Faol xodimlar" value={overviewQuery.data?.totalActiveEmployees ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="Bugun kelgan" value={overviewQuery.data?.presentToday ?? 0} styles={{ content: { color: '#3f8600' } }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="Kechikkan" value={overviewQuery.data?.lateToday ?? 0} styles={{ content: { color: '#faad14' } }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="Kelmagan" value={overviewQuery.data?.absentToday ?? 0} styles={{ content: { color: '#f5222d' } }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="Ta'tilda" value={overviewQuery.data?.onLeaveToday ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="O'rtacha soat" value={overviewQuery.data?.averageWorkingHours ?? 0} />
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Bo'lim"
          allowClear
          style={{ width: 180 }}
          options={departmentsQuery.data?.items.map((d) => ({ value: d.id, label: d.name }))}
          onChange={(value) => {
            setDepartmentId(value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 160 }}
          options={Object.keys(STATUS_COLORS).map((value) => ({ value, label: value }))}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <RangePicker
          value={range}
          onChange={(value) => {
            setRange(value);
            setPage(1);
          }}
        />
        <Button icon={<DownloadOutlined />} onClick={() => handleExport('late')}>
          Kechikish hisoboti
        </Button>
        <Button icon={<DownloadOutlined />} onClick={() => handleExport('absence')}>
          Yo'qlik hisoboti
        </Button>
        <Button icon={<DownloadOutlined />} onClick={() => handleExport('overtime')}>
          Qo'shimcha ish hisoboti
        </Button>
      </Space>

      <Table<AttendanceRecordItem>
        rowKey="id"
        loading={attendanceQuery.isLoading}
        dataSource={attendanceQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: attendanceQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Xodim', dataIndex: ['employee', 'fullName'] },
          { title: "Bo'lim", render: (_, record) => record.employee.department?.name ?? '—' },
          { title: 'Sana', dataIndex: 'workDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
          { title: 'Kelgan', dataIndex: 'checkInAt', render: (v: string | null) => (v ? new Date(v).toLocaleTimeString('uz-UZ') : '—') },
          { title: 'Ketgan', dataIndex: 'checkOutAt', render: (v: string | null) => (v ? new Date(v).toLocaleTimeString('uz-UZ') : '—') },
          { title: 'Soat', dataIndex: 'hoursWorked', render: (v: string | null) => v ?? '—' },
          { title: 'Kechikish (daq)', dataIndex: 'lateMinutes' },
          { title: "Qo'shimcha (daq)", dataIndex: 'overtimeMinutes' },
          { title: 'Status', dataIndex: 'status', render: (v: AttendanceStatus) => <Tag color={STATUS_COLORS[v]}>{v}</Tag> },
        ]}
      />

      <CheckInOutModal open={checkInOpen} onClose={() => setCheckInOpen(false)} mode="in" />
      <CheckInOutModal open={checkOutOpen} onClose={() => setCheckOutOpen(false)} mode="out" />
    </div>
  );
}
