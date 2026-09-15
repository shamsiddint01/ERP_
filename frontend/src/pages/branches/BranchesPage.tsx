import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBranches } from '../../api/branches';
import { BranchFormModal } from '../../components/BranchFormModal';
import { PageErrorState } from '../../components/PageErrorState';
import { useAuthStore } from '../../store/auth.store';
import type { BranchListItem, BranchStatus } from '../../types';

const STATUS_COLORS: Record<BranchStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };
const STATUS_LABELS: Record<BranchStatus, string> = { ACTIVE: 'Faol', INACTIVE: 'Nofaol' };

export function BranchesPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BranchStatus | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const branchesQuery = useQuery({
    queryKey: ['branches', { search, status, page }],
    queryFn: () => listBranches({ search: search || undefined, status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  if (branchesQuery.isError && !branchesQuery.data) {
    return <PageErrorState onRetry={() => branchesQuery.refetch()} />;
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Filiallar
        </Typography.Title>
        {hasPermission('branches', 'CREATE') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi filial
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Qidirish: nomi, kodi, manzil, telefon"
          prefix={<SearchOutlined />}
          style={{ width: 280 }}
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

      <Table<BranchListItem>
        rowKey="id"
        loading={branchesQuery.isLoading}
        dataSource={branchesQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/branches/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: branchesQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Nomi', dataIndex: 'name' },
          { title: 'Kod', dataIndex: 'code' },
          { title: 'Manzil', dataIndex: 'address', render: (v: string | null) => v ?? '—' },
          { title: 'Telefon', dataIndex: 'phone', render: (v: string | null) => v ?? '—' },
          { title: 'Rahbar', render: (_, record) => record.managerEmployee?.fullName ?? '—' },
          { title: 'Xonalar', render: (_, record) => record._count.classrooms },
          { title: "O'quvchilar", render: (_, record) => record._count.students },
          { title: 'Status', dataIndex: 'status', render: (v: BranchStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
        ]}
      />

      <BranchFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
