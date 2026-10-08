import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Table, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listBranches } from '../../api/branches';
import { listTeachers } from '../../api/teachers';
import { FilterBar } from '../../components/FilterBar';
import { PageErrorState } from '../../components/PageErrorState';
import { LoginCell } from '../../components/LoginCell';
import { PageHeader } from '../../components/PageHeader';
import { TeacherFormModal } from '../../components/TeacherFormModal';
import { useAuthStore } from '../../store/auth.store';
import type { TeacherListItem, TeacherProfileStatus } from '../../types';

const STATUS_COLORS: Record<TeacherProfileStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };
const STATUS_LABELS: Record<TeacherProfileStatus, string> = { ACTIVE: 'Faol', INACTIVE: 'Nofaol' };

export function TeachersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [branchId, setBranchId] = useState<string | undefined>();
  const [status, setStatus] = useState<TeacherProfileStatus | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const canBranches = hasPermission('branches', 'VIEW');
  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100 }], queryFn: () => listBranches({ pageSize: 100 }), enabled: canBranches });
  const teachersQuery = useQuery({
    queryKey: ['teachers', { search, branchId, status, page }],
    queryFn: () => listTeachers({ search: search || undefined, branchId, status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  if (teachersQuery.isError && !teachersQuery.data) {
    return <PageErrorState onRetry={() => teachersQuery.refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title="O'qituvchilar"
        extra={
          hasPermission('teachers', 'CREATE') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Yangi o'qituvchi profili
            </Button>
          )
        }
      />

      <FilterBar>
        <Input
          placeholder="Qidirish: F.I.Sh., telefon, mutaxassislik"
          prefix={<SearchOutlined />}
          style={{ width: 280 }}
          allowClear
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {canBranches && (
          <Select
            placeholder="Filial"
            allowClear
            style={{ width: 180 }}
            options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))}
            onChange={(value) => {
              setBranchId(value);
              setPage(1);
            }}
          />
        )}
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
      </FilterBar>

      <Table<TeacherListItem>
        rowKey="id"
        loading={teachersQuery.isLoading}
        dataSource={teachersQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/teachers/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: teachersQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'F.I.Sh.', render: (_, record) => record.employee.fullName },
          { title: 'Kod', responsive: ['md'], render: (_, record) => record.employee.employeeCode },
          { title: 'Telefon', render: (_, record) => record.employee.phone },
          { title: 'Login', render: (_, record) => <LoginCell user={record.employee.user} /> },
          { title: 'Mutaxassislik', responsive: ['md'], dataIndex: 'specialization', render: (v: string | null) => v ?? '—' },
          { title: 'Guruhlar', responsive: ['md'], render: (_, record) => record.employee._count.taughtGroups },
          { title: 'Status', dataIndex: 'status', render: (v: TeacherProfileStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
        ]}
      />

      <TeacherFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
