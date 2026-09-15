import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBranches } from '../../api/branches';
import { listStudents } from '../../api/students';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { StudentFormModal } from '../../components/StudentFormModal';
import { useAuthStore } from '../../store/auth.store';
import { avatarColor } from '../../utils/avatarColor';
import { formatDate } from '../../utils/format';
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

  if (studentsQuery.isError && !studentsQuery.data) {
    return <PageErrorState onRetry={() => studentsQuery.refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title="O'quvchilar"
        extra={
          hasPermission('students', 'CREATE') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Yangi o'quvchi
            </Button>
          )
        }
      />

      <FilterBar>
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
      </FilterBar>

      <Table<StudentListItem>
        rowKey="id"
        loading={studentsQuery.isLoading}
        dataSource={studentsQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/students/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: studentsQuery.data?.total, onChange: setPage }}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: (
            <EmptyState
              title="Hali o'quvchi yo'q"
              description="Markazingizni boshqarishni boshlash uchun birinchi o'quvchini qo'shing."
              action={
                hasPermission('students', 'CREATE') && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                    O'quvchi qo'shish
                  </Button>
                )
              }
            />
          ),
        }}
        columns={[
          {
            title: 'F.I.Sh.',
            dataIndex: 'fullName',
            render: (name: string, record) => (
              <Space>
                <Avatar size={32} style={{ background: avatarColor(name), flexShrink: 0 }}>
                  {name.charAt(0)}
                </Avatar>
                <div>
                  <div style={{ fontWeight: 500 }}>{name}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {record.studentCode}
                  </Typography.Text>
                </div>
              </Space>
            ),
          },
          { title: 'Filial', render: (_, record) => record.branch?.name ?? '—' },
          { title: 'Telefon', dataIndex: 'phone', render: (v: string | null) => v ?? '—' },
          { title: 'Vasiylar', render: (_, record) => record._count.guardians },
          { title: "Yozilishlar", render: (_, record) => record._count.enrollments },
          { title: 'Status', dataIndex: 'status', render: (v: StudentStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          { title: "Ro'yxatga olingan sana", dataIndex: 'registrationDate', render: (v: string) => formatDate(v) },
        ]}
      />

      <StudentFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
