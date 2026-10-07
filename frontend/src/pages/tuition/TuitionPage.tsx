import { EyeOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Select, Table } from 'antd';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listTuitionCharges } from '../../api/tuition';
import { CreateTuitionChargeModal } from '../../components/CreateTuitionChargeModal';
import { FilterBar } from '../../components/FilterBar';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { useAuthStore } from '../../store/auth.store';
import { ChargeStateTag } from '../../components/PaymentStateTag';
import type { TuitionCharge } from '../../types';
import { PAYMENT_STATE_OPTIONS, type PaymentState } from '../../utils/paymentState';

export function TuitionPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [searchParams] = useSearchParams();
  // Deep links can preselect a state via ?state=PAID|UNPAID.
  const [state, setState] = useState<PaymentState | undefined>(() => {
    const requested = searchParams.get('state');
    return requested === 'PAID' || requested === 'UNPAID' ? requested : undefined;
  });
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const chargesQuery = useQuery({
    queryKey: ['tuition-charges', { state, page }],
    queryFn: () => listTuitionCharges({ paymentState: state, page, pageSize: 20 }),
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
          value={state}
          options={PAYMENT_STATE_OPTIONS}
          onChange={(value) => {
            setState(value);
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
          { title: 'Status', render: (_, record) => <ChargeStateTag charge={record} /> },
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
