import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPurchaseOrders } from '../../api/purchases';
import { CreatePurchaseOrderModal } from '../../components/CreatePurchaseOrderModal';
import { useAuthStore } from '../../store/auth.store';
import type { PurchaseOrder, PurchaseOrderStatus } from '../../types';

const STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'default',
  PENDING: 'gold',
  APPROVED: 'blue',
  PARTIALLY_RECEIVED: 'orange',
  RECEIVED: 'green',
  CANCELLED: 'red',
};

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Qoralama',
  PENDING: 'Kutilmoqda',
  APPROVED: 'Tasdiqlangan',
  PARTIALLY_RECEIVED: "Qisman qabul qilingan",
  RECEIVED: 'Qabul qilingan',
  CANCELLED: 'Bekor qilingan',
};

export function PurchasesPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PurchaseOrderStatus | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const purchasesQuery = useQuery({
    queryKey: ['purchases', { search, status, page }],
    queryFn: () => listPurchaseOrders({ search: search || undefined, status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Xarid buyurtmalari
        </Typography.Title>
        {hasPermission('purchases', 'CREATE') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi buyurtma
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="Qidirish: PO raqami"
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
          style={{ width: 200 }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </Space>

      <Table<PurchaseOrder>
        rowKey="id"
        loading={purchasesQuery.isLoading}
        dataSource={purchasesQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/purchases/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: purchasesQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Raqam', dataIndex: 'poNumber' },
          { title: 'Yetkazib beruvchi', dataIndex: ['supplier', 'companyName'] },
          { title: 'Ombor', dataIndex: ['warehouse', 'name'] },
          { title: 'Summa', dataIndex: 'grandTotal', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          { title: 'Status', dataIndex: 'status', render: (v: PurchaseOrderStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          { title: 'Sana', dataIndex: 'orderDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
        ]}
      />

      <CreatePurchaseOrderModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
