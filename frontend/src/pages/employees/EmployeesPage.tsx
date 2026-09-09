import { PlusOutlined, SearchOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Input, Popconfirm, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listDepartments } from '../../api/departments';
import { getEmployeesOverview, listEmployees, reactivateEmployee, terminateEmployee } from '../../api/employees';
import { listPositions } from '../../api/positions';
import { CreateEmployeeModal } from '../../components/CreateEmployeeModal';
import { useAuthStore } from '../../store/auth.store';
import type { EmployeeListItem, EmployeeStatus } from '../../types';

const STATUS_COLORS: Record<EmployeeStatus, string> = { ACTIVE: 'green', ON_LEAVE: 'gold', SUSPENDED: 'orange', TERMINATED: 'default' };
const STATUS_LABELS: Record<EmployeeStatus, string> = { ACTIVE: 'Faol', ON_LEAVE: "Ta'tilda", SUSPENDED: 'Vaqtincha to\'xtatilgan', TERMINATED: 'Ishdan bo\'shatilgan' };

export function EmployeesPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [positionId, setPositionId] = useState<string | undefined>();
  const [status, setStatus] = useState<EmployeeStatus | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const overviewQuery = useQuery({ queryKey: ['employees-overview'], queryFn: getEmployeesOverview });
  const departmentsQuery = useQuery({ queryKey: ['departments', { pageSize: 100 }], queryFn: () => listDepartments({ pageSize: 100 }) });
  const positionsQuery = useQuery({ queryKey: ['positions', { pageSize: 100 }], queryFn: () => listPositions({ pageSize: 100 }) });

  const employeesQuery = useQuery({
    queryKey: ['employees', { search, departmentId, positionId, status, page }],
    queryFn: () => listEmployees({ search: search || undefined, departmentId, positionId, status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
    queryClient.invalidateQueries({ queryKey: ['employees-overview'] });
  }

  const terminateMutation = useMutation({
    mutationFn: terminateEmployee,
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
    mutationFn: reactivateEmployee,
    onSuccess: () => {
      message.success('Xodim tiklandi');
      invalidate();
    },
  });

  const canDelete = hasPermission('employees', 'DELETE');

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Xodimlar
        </Typography.Title>
        {hasPermission('employees', 'CREATE') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi xodim
          </Button>
        )}
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic title="Jami" value={overviewQuery.data?.totalEmployees ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="Faol" value={overviewQuery.data?.activeCount ?? 0} styles={{ content: { color: '#3f8600' } }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="Ta'tilda" value={overviewQuery.data?.onLeaveCount ?? 0} styles={{ content: { color: '#faad14' } }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="To'xtatilgan" value={overviewQuery.data?.suspendedCount ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="Ishdan bo'shagan" value={overviewQuery.data?.terminatedCount ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="Bo'limlar" value={overviewQuery.data?.departmentCount ?? 0} />
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Qidirish: F.I.Sh, kod, telefon"
          prefix={<SearchOutlined />}
          style={{ width: 240 }}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
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
          placeholder="Lavozim"
          allowClear
          style={{ width: 180 }}
          options={positionsQuery.data?.items.map((p) => ({ value: p.id, label: p.title }))}
          onChange={(value) => {
            setPositionId(value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 180 }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </Space>

      <Table<EmployeeListItem>
        rowKey="id"
        loading={employeesQuery.isLoading}
        dataSource={employeesQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/employees/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: employeesQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Kod', dataIndex: 'employeeCode' },
          { title: 'F.I.Sh.', dataIndex: 'fullName' },
          { title: "Bo'lim", render: (_, record) => record.department?.name ?? '—' },
          { title: 'Lavozim', render: (_, record) => record.position?.title ?? '—' },
          { title: 'Telefon', dataIndex: 'phone' },
          { title: 'Status', dataIndex: 'status', render: (v: EmployeeStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          { title: 'Ishga qabul sanasi', dataIndex: 'hireDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
          {
            title: 'Amallar',
            render: (_, record) =>
              canDelete &&
              (record.status === 'TERMINATED' ? (
                <Button
                  size="small"
                  icon={<UndoOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    reactivateMutation.mutate(record.id);
                  }}
                >
                  Tiklash
                </Button>
              ) : (
                <Popconfirm
                  title="Xodimni ishdan bo'shatish?"
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    terminateMutation.mutate(record.id);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <Button size="small" danger icon={<StopOutlined />} onClick={(e) => e.stopPropagation()}>
                    Ishdan bo'shatish
                  </Button>
                </Popconfirm>
              )),
          },
        ]}
      />

      <CreateEmployeeModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
