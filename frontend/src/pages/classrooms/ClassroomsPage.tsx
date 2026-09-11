import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBranches } from '../../api/branches';
import { listClassrooms } from '../../api/classrooms';
import { ClassroomFormModal } from '../../components/ClassroomFormModal';
import { useAuthStore } from '../../store/auth.store';
import type { ClassroomListItem, ClassroomStatus } from '../../types';

const STATUS_COLORS: Record<ClassroomStatus, string> = { ACTIVE: 'green', INACTIVE: 'default', MAINTENANCE: 'gold' };
const STATUS_LABELS: Record<ClassroomStatus, string> = { ACTIVE: 'Faol', INACTIVE: 'Nofaol', MAINTENANCE: "Ta'mirlashda" };

export function ClassroomsPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState<string | undefined>();
  const [status, setStatus] = useState<ClassroomStatus | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100 }], queryFn: () => listBranches({ pageSize: 100 }) });
  const classroomsQuery = useQuery({
    queryKey: ['classrooms', { search, branchId, status, page }],
    queryFn: () => listClassrooms({ search: search || undefined, branchId, status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Xonalar
        </Typography.Title>
        {hasPermission('classrooms', 'CREATE') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi xona
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Qidirish: nomi yoki xona raqami"
          prefix={<SearchOutlined />}
          style={{ width: 260 }}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Filial"
          allowClear
          style={{ width: 200 }}
          options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))}
          onChange={(value) => {
            setBranchId(value);
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

      <Table<ClassroomListItem>
        rowKey="id"
        loading={classroomsQuery.isLoading}
        dataSource={classroomsQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/classrooms/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: classroomsQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Nomi', dataIndex: 'name' },
          { title: 'Xona raqami', dataIndex: 'roomNumber' },
          { title: 'Filial', render: (_, record) => record.branch.name },
          { title: "Sig'imi", dataIndex: 'capacity' },
          { title: 'Guruhlar', render: (_, record) => record._count.studentGroups },
          { title: 'Status', dataIndex: 'status', render: (v: ClassroomStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
        ]}
      />

      <ClassroomFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
