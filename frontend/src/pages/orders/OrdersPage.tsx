import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listOrders } from '../../api/orders';
import { CreateOrderModal } from '../../components/CreateOrderModal';
import { LegacyModuleNotice } from '../../components/LegacyModuleNotice';
import { useAuthStore } from '../../store/auth.store';
import type { Order, OrderPaymentStatus, OrderStatus } from '../../types';

const STATUS_COLORS: Record<OrderStatus, string> = {
  DRAFT: 'default',
  CONFIRMED: 'blue',
  PROCESSING: 'gold',
  COMPLETED: 'green',
  CANCELLED: 'red',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Qoralama',
  CONFIRMED: 'Tasdiqlangan',
  PROCESSING: 'Jarayonda',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
};

const PAYMENT_STATUS_COLORS: Record<OrderPaymentStatus, string> = {
  UNPAID: 'red',
  PARTIALLY_PAID: 'orange',
  PAID: 'green',
  REFUNDED: 'default',
};

const PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  UNPAID: "To'lanmagan",
  PARTIALLY_PAID: 'Qisman',
  PAID: "To'langan",
  REFUNDED: 'Qaytarilgan',
};

export function OrdersPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [paymentStatus, setPaymentStatus] = useState<OrderPaymentStatus | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const ordersQuery = useQuery({
    queryKey: ['orders', { search, status, paymentStatus, page }],
    queryFn: () => listOrders({ search: search || undefined, status, paymentStatus, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <LegacyModuleNotice />
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Sotuvlar / Buyurtmalar
        </Typography.Title>
        {hasPermission('orders', 'CREATE') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi sotuv
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Qidirish: buyurtma raqami"
          prefix={<SearchOutlined />}
          style={{ width: 240 }}
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
        <Select
          placeholder="To'lov statusi"
          allowClear
          style={{ width: 180 }}
          options={Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setPaymentStatus(value);
            setPage(1);
          }}
        />
      </Space>

      <Table<Order>
        rowKey="id"
        loading={ordersQuery.isLoading}
        dataSource={ordersQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/orders/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: ordersQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Raqam', dataIndex: 'orderNumber' },
          {
            title: 'Mijoz',
            render: (_, record) => record.customer.companyName ?? record.customer.name,
          },
          { title: 'Sana', dataIndex: 'orderDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
          { title: 'Mahsulotlar', dataIndex: 'items', render: (items: Order['items']) => items.length },
          { title: 'Jami', dataIndex: 'grandTotal', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          {
            title: "To'lov",
            dataIndex: 'paymentStatus',
            render: (v: OrderPaymentStatus) => <Tag color={PAYMENT_STATUS_COLORS[v]}>{PAYMENT_STATUS_LABELS[v]}</Tag>,
          },
          { title: 'Status', dataIndex: 'status', render: (v: OrderStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          { title: "Mas'ul", dataIndex: ['responsibleEmployee', 'fullName'], render: (v) => v ?? '—' },
        ]}
      />

      <CreateOrderModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
