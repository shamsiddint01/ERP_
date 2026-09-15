import { EyeOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Select, Table, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTuitionCharges } from '../../api/tuition';
import { CreateTuitionChargeModal } from '../../components/CreateTuitionChargeModal';
import { FilterBar } from '../../components/FilterBar';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { useAuthStore } from '../../store/auth.store';
import type { TuitionCharge, TuitionChargeStatus } from '../../types';

const STATUS_COLORS: Record<TuitionChargeStatus, string> = {
  PENDING: 'blue',
  PARTIALLY_PAID: 'orange',
  PAID: 'green',
  OVERDUE: 'red',
  CANCELLED: 'default',
};

const STATUS_LABELS: Record<TuitionChargeStatus, string> = {
  PENDING: 'Kutilmoqda',
  PARTIALLY_PAID: 'Qisman to‘langan',
  PAID: "To'langan",
  OVERDUE: 'Muddati o‘tgan',
  CANCELLED: 'Bekor qilingan',
};

export function TuitionPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [status, setStatus] = useState<TuitionChargeStatus | undefined>();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const chargesQuery = useQuery({
    queryKey: ['tuition-charges', { status, page }],
    queryFn: () => listTuitionCharges({ status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  const canCreate = hasPermission('tuition', 'CREATE');

  if (chargesQuery.isError && !chargesQuery.data) {
    return <PageErrorState onRetry={() => chargesQuery.refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title="O'quv to'lovlari (hisoblar)"
        extra={
          canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Yangi hisob
            </Button>
          )
        }
      />

      <FilterBar>
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
      </FilterBar>

      <Table<TuitionCharge>
        rowKey="id"
        loading={chargesQuery.isLoading}
        dataSource={chargesQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: chargesQuery.data?.total, onChange: setPage }}
        onRow={(record) => ({ onClick: () => navigate(`/tuition/${record.id}`), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'O\'quvchi', render: (_, record) => `${record.student.fullName} (${record.student.studentCode})` },
          { title: 'Guruh', render: (_, record) => record.enrollment.group.name },
          { title: 'Davr', dataIndex: 'billingPeriod' },
          { title: 'Summa', dataIndex: 'amount', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          { title: 'Chegirma', dataIndex: 'discountAmount', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          { title: 'Sof summa', dataIndex: 'netAmount', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          { title: 'Muddati', dataIndex: 'dueDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
          { title: 'Status', dataIndex: 'status', render: (v: TuitionChargeStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          {
            title: 'Amallar',
            render: (_, record) => (
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/tuition/${record.id}`);
                }}
              />
            ),
          },
        ]}
      />

      <CreateTuitionChargeModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
