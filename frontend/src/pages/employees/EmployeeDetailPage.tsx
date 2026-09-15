import { ArrowLeftOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Popconfirm, Row, Spin, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { EmptyState } from '../../components/EmptyState';
import { useNavigate, useParams } from 'react-router-dom';
import { getEmployee, getEmployeeActivity, reactivateEmployee, terminateEmployee } from '../../api/employees';
import { PageErrorState } from '../../components/PageErrorState';
import { useAuthStore } from '../../store/auth.store';
import type { AttendanceStatus, EmployeeStatus } from '../../types';
import { palette } from '../../theme';

const STATUS_COLORS: Record<EmployeeStatus, string> = { ACTIVE: 'green', ON_LEAVE: 'gold', SUSPENDED: 'orange', TERMINATED: 'default' };
const ATTENDANCE_STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: 'green',
  LATE: 'gold',
  ABSENT: 'red',
  HALF_DAY: 'blue',
  ON_LEAVE: 'purple',
  HOLIDAY: 'default',
};

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);

  const employeeQuery = useQuery({ queryKey: ['employee', id], queryFn: () => getEmployee(id!), enabled: !!id });
  const activityQuery = useQuery({ queryKey: ['employee-activity', id], queryFn: () => getEmployeeActivity(id!), enabled: !!id });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['employee', id] });
    queryClient.invalidateQueries({ queryKey: ['employees'] });
    queryClient.invalidateQueries({ queryKey: ['employees-overview'] });
  }

  const terminateMutation = useMutation({
    mutationFn: () => terminateEmployee(id!),
    onSuccess: () => {
      message.success('Xodim ishdan bo‘shatildi');
      invalidate();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Amalni bajarib bo‘lmadi');
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: () => reactivateEmployee(id!),
    onSuccess: () => {
      message.success('Xodim tiklandi');
      invalidate();
    },
  });

  if (employeeQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (employeeQuery.isError) {
    return <PageErrorState onRetry={() => employeeQuery.refetch()} />;
  }

  const employee = employeeQuery.data;
  if (!employee) return null;

  const canDelete = hasPermission('employees', 'DELETE');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/employees')} style={{ marginBottom: 8 }}>
        Xodimlar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {employee.fullName}
            </Typography.Title>
            <Typography.Text type="secondary">
              {employee.employeeCode} · {employee.position?.title ?? 'Lavozimsiz'}
            </Typography.Text>
          </Col>
          <Col>
            <Tag color={STATUS_COLORS[employee.status]} style={{ marginRight: 8 }}>
              {employee.status}
            </Tag>
            {canDelete &&
              (employee.status === 'TERMINATED' ? (
                <Button icon={<UndoOutlined />} onClick={() => reactivateMutation.mutate()} loading={reactivateMutation.isPending}>
                  Tiklash
                </Button>
              ) : (
                <Popconfirm title="Xodimni ishdan bo'shatish?" onConfirm={() => terminateMutation.mutate()}>
                  <Button loading={terminateMutation.isPending} danger icon={<StopOutlined />}>
                    Ishdan bo'shatish
                  </Button>
                </Popconfirm>
              ))}
          </Col>
        </Row>

        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }} title="Shaxsiy ma'lumotlar">
          <Descriptions.Item label="Telefon">{employee.phone}</Descriptions.Item>
          <Descriptions.Item label="Email">{employee.email ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Tug'ilgan sana">{employee.dateOfBirth ? new Date(employee.dateOfBirth).toLocaleDateString('uz-UZ') : '—'}</Descriptions.Item>
          <Descriptions.Item label="Manzil" span={3}>
            {employee.address ?? '—'}
          </Descriptions.Item>
        </Descriptions>

        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }} title="Ish ma'lumotlari">
          <Descriptions.Item label="Bo'lim">{employee.department?.name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Lavozim">{employee.position?.title ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Rahbar">{employee.manager?.fullName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Ishga qabul sanasi">{new Date(employee.hireDate).toLocaleDateString('uz-UZ')}</Descriptions.Item>
          {employee.terminationDate && (
            <Descriptions.Item label="Ishdan bo'shagan sana">{new Date(employee.terminationDate).toLocaleDateString('uz-UZ')}</Descriptions.Item>
          )}
          <Descriptions.Item label="Tizim foydalanuvchisi">
            {employee.user ? `${employee.user.username} (${employee.user.status})` : 'Bog\'lanmagan'}
          </Descriptions.Item>
          {employee.notes && (
            <Descriptions.Item label="Izoh" span={3}>
              {employee.notes}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {activityQuery.data && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Kelgan kunlar" value={activityQuery.data.attendanceSummary.presentCount} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Kechikkan kunlar" value={activityQuery.data.attendanceSummary.lateCount} styles={{ content: { color: palette.warning } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Kelmagan kunlar" value={activityQuery.data.attendanceSummary.absentCount} styles={{ content: { color: palette.error } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Qo'shimcha ish (daqiqa)" value={activityQuery.data.attendanceSummary.totalOvertimeMinutes} />
            </Card>
          </Col>
        </Row>
      )}

      <Card>
        <Tabs
          items={[
            {
              key: 'attendance',
              label: `Davomat (${activityQuery.data?.attendanceRecords.length ?? 0})`,
              children: activityQuery.data?.attendanceRecords.length ? (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={activityQuery.data.attendanceRecords}
                  columns={[
                    { title: 'Sana', dataIndex: 'workDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
                    { title: 'Kelgan', dataIndex: 'checkInAt', render: (v: string | null) => (v ? new Date(v).toLocaleTimeString('uz-UZ') : '—') },
                    { title: 'Ketgan', dataIndex: 'checkOutAt', render: (v: string | null) => (v ? new Date(v).toLocaleTimeString('uz-UZ') : '—') },
                    { title: 'Soat', dataIndex: 'hoursWorked', render: (v: string | null) => v ?? '—' },
                    { title: 'Kechikish (daq)', dataIndex: 'lateMinutes' },
                    {
                      title: 'Status',
                      dataIndex: 'status',
                      render: (v: AttendanceStatus) => <Tag color={ATTENDANCE_STATUS_COLORS[v]}>{v}</Tag>,
                    },
                  ]}
                />
              ) : (
                <EmptyState title="Davomat yozuvlari yo'q" />
              ),
            },
            {
              key: 'orders',
              label: `Buyurtmalar (${activityQuery.data?.orders.length ?? 0})`,
              children: activityQuery.data?.orders.length ? (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={activityQuery.data.orders}
                  onRow={(record) => ({ onClick: () => navigate(`/orders/${record.id}`), style: { cursor: 'pointer' } })}
                  columns={[
                    { title: 'Raqam', dataIndex: 'orderNumber' },
                    { title: 'Status', dataIndex: 'status' },
                    { title: 'Summa', dataIndex: 'grandTotal', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
                    { title: 'Sana', dataIndex: 'orderDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
                  ]}
                />
              ) : (
                <EmptyState title="Buyurtmalar yo'q" />
              ),
            },
            {
              key: 'expenses',
              label: `Xarajatlar (${activityQuery.data?.expenses.length ?? 0})`,
              children: activityQuery.data?.expenses.length ? (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={activityQuery.data.expenses}
                  columns={[
                    { title: 'Raqam', dataIndex: 'expenseNumber' },
                    { title: 'Status', dataIndex: 'status' },
                    { title: 'Summa', dataIndex: 'amount', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
                    { title: 'Sana', dataIndex: 'expenseDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
                  ]}
                />
              ) : (
                <EmptyState title="Xarajatlar yo'q" />
              ),
            },
            {
              key: 'activity',
              label: `Activity (${activityQuery.data?.activity.length ?? 0})`,
              children: activityQuery.data?.activity.length ? (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={activityQuery.data.activity}
                  columns={[
                    { title: 'Sana', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('uz-UZ') },
                    { title: 'Amal', dataIndex: 'action' },
                    { title: 'Izoh', dataIndex: 'description' },
                    { title: 'Kim', render: (_, record) => record.actor?.fullName ?? 'System' },
                  ]}
                />
              ) : (
                <EmptyState title="Activity yo'q" />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
