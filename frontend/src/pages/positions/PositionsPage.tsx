import { PlusOutlined, SearchOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { listDepartments } from '../../api/departments';
import { deactivatePosition, listPositions } from '../../api/positions';
import { CreatePositionModal } from '../../components/CreatePositionModal';
import { useAuthStore } from '../../store/auth.store';
import type { PositionItem, PositionStatus } from '../../types';

const STATUS_COLORS: Record<PositionStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };
const STATUS_LABELS: Record<PositionStatus, string> = { ACTIVE: 'Faol', INACTIVE: 'Faolsiz' };

export function PositionsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [status, setStatus] = useState<PositionStatus | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const departmentsQuery = useQuery({ queryKey: ['departments', { pageSize: 100 }], queryFn: () => listDepartments({ pageSize: 100 }) });
  const positionsQuery = useQuery({
    queryKey: ['positions', { search, departmentId, status, page }],
    queryFn: () => listPositions({ search: search || undefined, departmentId, status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivatePosition,
    onSuccess: () => {
      message.success('Lavozim faolsizlantirildi');
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Faolsizlantirib bo‘lmadi');
    },
  });

  const canEdit = hasPermission('positions', 'EDIT');

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Lavozimlar
        </Typography.Title>
        {hasPermission('positions', 'CREATE') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi lavozim
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
          placeholder="Bo'lim"
          allowClear
          style={{ width: 200 }}
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
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </Space>

      <Table<PositionItem>
        rowKey="id"
        loading={positionsQuery.isLoading}
        dataSource={positionsQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: positionsQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Nomi', dataIndex: 'title' },
          { title: 'Kod', dataIndex: 'code' },
          { title: "Bo'lim", dataIndex: ['department', 'name'] },
          { title: 'Xodimlar', render: (_, record) => record._count?.employees ?? 0 },
          { title: 'Status', dataIndex: 'status', render: (v: PositionStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          {
            title: 'Amallar',
            render: (_, record) =>
              canEdit &&
              record.status === 'ACTIVE' && (
                <Popconfirm title="Lavozimni faolsizlantirish?" onConfirm={() => deactivateMutation.mutate(record.id)}>
                  <Button size="small" danger icon={<StopOutlined />}>
                    Faolsizlantirish
                  </Button>
                </Popconfirm>
              ),
          },
        ]}
      />

      <CreatePositionModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
