import { SearchOutlined, SplitCellsOutlined, UndoOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { listPayments, refundPayment } from '../../api/payments';
import { AllocatePaymentModal } from '../../components/AllocatePaymentModal';
import { FilterBar } from '../../components/FilterBar';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { useAuthStore } from '../../store/auth.store';
import type { Payment, PaymentMethod, PaymentStatus } from '../../types';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Naqd',
  CARD: 'Karta',
  BANK_TRANSFER: "O'tkazma",
  ONLINE: 'Onlayn',
  CHEQUE: 'Chek',
};

const STATUS_COLORS: Record<PaymentStatus, string> = {
  PENDING: 'gold',
  COMPLETED: 'green',
  FAILED: 'red',
  REFUNDED: 'default',
};

export function PaymentsPage() {
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<PaymentMethod | undefined>();
  const [status, setStatus] = useState<PaymentStatus | undefined>();
  const [page, setPage] = useState(1);
  const [allocatingPayment, setAllocatingPayment] = useState<Payment | null>(null);

  const paymentsQuery = useQuery({
    queryKey: ['payments', { search, method, status, page }],
    queryFn: () => listPayments({ search: search || undefined, method, status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  const refundMutation = useMutation({
    mutationFn: refundPayment,
    onSuccess: () => {
      message.success("To'lov qaytarildi");
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['tuition'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Qaytarib bo‘lmadi');
    },
  });

  const canRefund = hasPermission('payments', 'APPROVE');
  const canAllocate = hasPermission('tuition', 'EDIT');

  if (paymentsQuery.isError && !paymentsQuery.data) {
    return <PageErrorState onRetry={() => paymentsQuery.refetch()} />;
  }

  return (
    <div>
      <PageHeader title="To'lovlar" />

      <FilterBar>
        <Input
          placeholder="Qidirish: to'lov raqami"
          prefix={<SearchOutlined />}
          style={{ width: 240 }}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Usul"
          allowClear
          style={{ width: 160 }}
          options={Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setMethod(value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 160 }}
          options={[
            { label: 'Kutilmoqda', value: 'PENDING' },
            { label: 'Bajarilgan', value: 'COMPLETED' },
            { label: 'Muvaffaqiyatsiz', value: 'FAILED' },
            { label: 'Qaytarilgan', value: 'REFUNDED' },
          ]}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </FilterBar>

      <Table<Payment>
        rowKey="id"
        loading={paymentsQuery.isLoading}
        dataSource={paymentsQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: paymentsQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Raqam', dataIndex: 'paymentNumber' },
          {
            title: "O'quvchi",
            render: (_, record) => (record.student ? <Link to={`/students/${record.student.id}?tab=finance`}>{record.student.fullName}</Link> : '—'),
          },
          { title: 'Summa', dataIndex: 'amount', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          { title: 'Usul', dataIndex: 'method', render: (v: PaymentMethod) => METHOD_LABELS[v] },
          { title: 'Sana', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('uz-UZ') },
          { title: 'Status', dataIndex: 'status', render: (v: PaymentStatus) => <Tag color={STATUS_COLORS[v]}>{v}</Tag> },
          { title: 'Kim yozgan', dataIndex: ['recordedBy', 'fullName'] },
          {
            title: 'Amallar',
            render: (_, record) => (
              <Space>
                {canAllocate && record.status === 'COMPLETED' && (
                  <Button size="small" icon={<SplitCellsOutlined />} onClick={() => setAllocatingPayment(record)}>
                    Taqsimlash
                  </Button>
                )}
                {canRefund && record.status === 'COMPLETED' && (
                  <Popconfirm title="To'lovni qaytarish?" onConfirm={() => refundMutation.mutate(record.id)}>
                    <Button loading={refundMutation.isPending} size="small" danger icon={<UndoOutlined />}>
                      Qaytarish
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <AllocatePaymentModal open={!!allocatingPayment} onClose={() => setAllocatingPayment(null)} payment={allocatingPayment} />
    </div>
  );
}
