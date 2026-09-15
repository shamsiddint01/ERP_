import { SearchOutlined, SplitCellsOutlined, UndoOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { listPayments, refundPayment, type PaymentQuery } from '../../api/payments';
import { AllocatePaymentModal } from '../../components/AllocatePaymentModal';
import { PageErrorState } from '../../components/PageErrorState';
import { useAuthStore } from '../../store/auth.store';
import type { Payment, PaymentMethod, PaymentStatus } from '../../types';

const REFERENCE_TYPE_LABELS: Record<NonNullable<PaymentQuery['referenceType']>, string> = {
  ORDER: 'Sotuv',
  INVOICE: 'Hisob-faktura',
  PURCHASE_ORDER: 'Xarid',
  EXPENSE: 'Xarajat',
  OTHER: 'Boshqa',
  TUITION_CHARGE: "O'quv to'lovi",
};

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
  const [referenceType, setReferenceType] = useState<PaymentQuery['referenceType']>();
  const [page, setPage] = useState(1);
  const [allocatingPayment, setAllocatingPayment] = useState<Payment | null>(null);

  const paymentsQuery = useQuery({
    queryKey: ['payments', { search, method, status, referenceType, page }],
    queryFn: () => listPayments({ search: search || undefined, method, status, referenceType, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  const refundMutation = useMutation({
    mutationFn: refundPayment,
    onSuccess: () => {
      message.success("To'lov qaytarildi");
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
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
      <Typography.Title level={4}>To'lovlar</Typography.Title>

      <Space style={{ marginBottom: 16 }} wrap>
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
        <Select
          placeholder="Manba turi"
          allowClear
          style={{ width: 180 }}
          options={Object.entries(REFERENCE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setReferenceType(value);
            setPage(1);
          }}
        />
      </Space>

      <Table<Payment>
        rowKey="id"
        loading={paymentsQuery.isLoading}
        dataSource={paymentsQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: paymentsQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Raqam', dataIndex: 'paymentNumber' },
          {
            title: "Mijoz / O'quvchi",
            render: (_, record) =>
              record.payerCustomer?.companyName ?? record.payerCustomer?.name ?? (record.referenceType === 'TUITION_CHARGE' ? "O'quvchi to'lovi" : '—'),
          },
          { title: 'Manba', dataIndex: 'referenceType', render: (v: Payment['referenceType']) => (v ? (REFERENCE_TYPE_LABELS[v] ?? v) : '—') },
          { title: 'Summa', dataIndex: 'amount', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          { title: 'Usul', dataIndex: 'method', render: (v: PaymentMethod) => METHOD_LABELS[v] },
          { title: 'Sana', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('uz-UZ') },
          { title: 'Status', dataIndex: 'status', render: (v: PaymentStatus) => <Tag color={STATUS_COLORS[v]}>{v}</Tag> },
          { title: 'Kim yozgan', dataIndex: ['recordedBy', 'fullName'] },
          {
            title: 'Amallar',
            render: (_, record) => (
              <Space>
                {canAllocate && record.referenceType === 'TUITION_CHARGE' && record.status === 'COMPLETED' && (
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
