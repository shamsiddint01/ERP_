import { PlusOutlined, SearchOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deactivateDepartment, listDepartments } from '../../api/departments';
import { CreateDepartmentModal } from '../../components/CreateDepartmentModal';
import { useAuthStore } from '../../store/auth.store';
import type { DepartmentListItem, DepartmentStatus } from '../../types';

const STATUS_COLORS: Record<DepartmentStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };
const STATUS_LABELS: Record<DepartmentStatus, string> = { ACTIVE: 'Faol', INACTIVE: 'Faolsiz' };

export function DepartmentsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<DepartmentStatus | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const departmentsQuery = useQuery({
    queryKey: ['departments', { search, status, page }],
    queryFn: () => listDepartments({ search: search || undefined, status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateDepartment,
    onSuccess: () => {
      message.success("Bo'lim faolsizlantirildi");
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Faolsizlantirib bo‘lmadi');
    },
  });

  const canEdit = hasPermission('departments', 'EDIT');

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Bo'limlar
        </Typography.Title>
        {hasPermission('departments', 'CREATE') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi bo'lim
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="Qidirish: nomi yoki kodi"
          prefix={<SearchOutlined />}
          style={{ width: 240 }}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 160 }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </Space>

      <Table<DepartmentListItem>
        rowKey="id"
        loading={departmentsQuery.isLoading}
        dataSource={departmentsQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/departments/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: departmentsQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Nomi', dataIndex: 'name' },
          { title: 'Kod', dataIndex: 'code' },
          { title: 'Rahbar', render: (_, record) => record.managerEmployee?.fullName ?? '—' },
          { title: 'Xodimlar', render: (_, record) => `${record.activeEmployeeCount} / ${record.employeeCount}` },
          { title: 'Status', dataIndex: 'status', render: (v: DepartmentStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          {
            title: 'Amallar',
            render: (_, record) =>
              canEdit &&
              record.status === 'ACTIVE' && (
                <Popconfirm
                  title="Bo'limni faolsizlantirish?"
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    deactivateMutation.mutate(record.id);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <Button size="small" danger icon={<StopOutlined />} loading={deactivateMutation.isPending} onClick={(e) => e.stopPropagation()}>
                    Faolsizlantirish
                  </Button>
                </Popconfirm>
              ),
          },
        ]}
      />

      <CreateDepartmentModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
