import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBranches } from '../../api/branches';
import { listStudents } from '../../api/students';
import { StudentFormModal } from '../../components/StudentFormModal';
import { useAuthStore } from '../../store/auth.store';
import type { StudentListItem, StudentStatus } from '../../types';

const STATUS_COLORS: Record<StudentStatus, string> = { ACTIVE: 'green', PAUSED: 'gold', GRADUATED: 'blue', INACTIVE: 'default', LEFT: 'red' };
const STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'Faol',
  PAUSED: 'Muzlatilgan',
  GRADUATED: 'Bitirgan',
  INACTIVE: 'Nofaol',
  LEFT: "Chiqib ketgan",
};

export function StudentsPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StudentStatus | undefined>();
  const [branchId, setBranchId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const canBranches = hasPermission('branches', 'VIEW');
  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100 }], queryFn: () => listBranches({ pageSize: 100 }), enabled: canBranches });
  const studentsQuery = useQuery({
    queryKey: ['students', { search, status, branchId, page }],
    queryFn: () => listStudents({ search: search || undefined, status, branchId, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          O'quvchilar
        </Typography.Title>
        {hasPermission('students', 'CREATE') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi o'quvchi
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Qidirish: F.I.Sh., kod, telefon"
          prefix={<SearchOutlined />}
          style={{ width: 260 }}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
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
        {canBranches && (
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
        )}
      </Space>

      <Table<StudentListItem>
        rowKey="id"
        loading={studentsQuery.isLoading}
        dataSource={studentsQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/students/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: studentsQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Kod', dataIndex: 'studentCode' },
          { title: 'F.I.Sh.', dataIndex: 'fullName' },
          { title: 'Filial', render: (_, record) => record.branch?.name ?? '—' },
          { title: 'Telefon', dataIndex: 'phone', render: (v: string | null) => v ?? '—' },
          { title: 'Vasiylar', render: (_, record) => record._count.guardians },
          { title: "Yozilishlar", render: (_, record) => record._count.enrollments },
          { title: 'Status', dataIndex: 'status', render: (v: StudentStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          { title: "Ro'yxatga olingan sana", dataIndex: 'registrationDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
        ]}
      />

      <StudentFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
