import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Table, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBranches } from '../../api/branches';
import { listCourses } from '../../api/courses';
import { listLeads } from '../../api/leads';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { LeadFormModal } from '../../components/LeadFormModal';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { useAuthStore } from '../../store/auth.store';
import { formatDateTime } from '../../utils/format';
import type { LeadListItem, LeadStatus } from '../../types';

const STATUS_COLORS: Record<LeadStatus, string> = {
  NEW: 'blue',
  CONTACTED: 'gold',
  TRIAL_SCHEDULED: 'purple',
  TRIAL_COMPLETED: 'cyan',
  ENROLLED: 'green',
  LOST: 'red',
};
const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Yangi',
  CONTACTED: "Bog'lanildi",
  TRIAL_SCHEDULED: "Sinov darsi belgilandi",
  TRIAL_COMPLETED: "Sinov darsi o'tdi",
  ENROLLED: "O'quvchiga aylandi",
  LOST: "Yo'qotildi",
};

export function LeadsPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LeadStatus | undefined>();
  const [preferredCourseId, setPreferredCourseId] = useState<string | undefined>();
  const [preferredBranchId, setPreferredBranchId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const canCourses = hasPermission('courses', 'VIEW');
  const canBranches = hasPermission('branches', 'VIEW');
  const coursesQuery = useQuery({ queryKey: ['courses', { pageSize: 100 }], queryFn: () => listCourses({ pageSize: 100 }), enabled: canCourses });
  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100 }], queryFn: () => listBranches({ pageSize: 100 }), enabled: canBranches });
  const leadsQuery = useQuery({
    queryKey: ['leads', { search, status, preferredCourseId, preferredBranchId, page }],
    queryFn: () => listLeads({ search: search || undefined, status, preferredCourseId, preferredBranchId, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  if (leadsQuery.isError && !leadsQuery.data) {
    return <PageErrorState onRetry={() => leadsQuery.refetch()} />;
  }

  const canCreate = hasPermission('leads', 'CREATE');

  return (
    <div>
      <PageHeader
        title="Lidlar / Qabul CRM"
        extra={
          canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Yangi lid
            </Button>
          )
        }
      />

      <FilterBar>
        <Input
          placeholder="Qidirish: F.I.Sh., telefon"
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
          style={{ width: 200 }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        {canCourses && (
          <Select
            placeholder="Kurs"
            allowClear
            style={{ width: 200 }}
            options={coursesQuery.data?.items.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(value) => {
              setPreferredCourseId(value);
              setPage(1);
            }}
          />
        )}
        {canBranches && (
          <Select
            placeholder="Filial"
            allowClear
            style={{ width: 200 }}
            options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))}
            onChange={(value) => {
              setPreferredBranchId(value);
              setPage(1);
            }}
          />
        )}
      </FilterBar>

      <Table<LeadListItem>
        rowKey="id"
        loading={leadsQuery.isLoading}
        dataSource={leadsQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/leads/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: leadsQuery.data?.total, onChange: setPage }}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: (
            <EmptyState
              title="Hali lid yo'q"
              description="Yangi mijozlar bilan ishlashni boshlash uchun birinchi lidni qo'shing."
              action={
                canCreate && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                    Lid qo'shish
                  </Button>
                )
              }
            />
          ),
        }}
        columns={[
          { title: 'F.I.Sh.', dataIndex: 'fullName' },
          { title: 'Telefon', dataIndex: 'phone' },
          { title: 'Manba', dataIndex: 'source', render: (v: string | null) => v ?? '—' },
          { title: "Qiziqqan kurs", render: (_, record) => record.preferredCourse?.name ?? '—' },
          { title: "Mas'ul xodim", render: (_, record) => record.assignedEmployee?.fullName ?? '—' },
          { title: 'Faoliyatlar', render: (_, record) => record._count.activities },
          {
            title: 'Keyingi aloqa',
            dataIndex: 'nextFollowUpAt',
            render: (v: string | null) => (v ? formatDateTime(v) : '—'),
          },
          { title: 'Status', dataIndex: 'status', render: (v: LeadStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
        ]}
      />

      <LeadFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
