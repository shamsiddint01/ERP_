import { PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Popconfirm, Row, Select, Space, Statistic, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { useState } from 'react';
import { cancelTransfer, completeTransfer, getInventorySummary, listMovements, listStock, listTransfers } from '../../api/inventory';
import { listWarehouses } from '../../api/warehouses';
import { CreateTransferModal } from '../../components/CreateTransferModal';
import { LegacyModuleNotice } from '../../components/LegacyModuleNotice';
import { StockActionModal } from '../../components/StockActionModal';
import { StockStatusBadge } from '../../components/StockStatusBadge';
import { useAuthStore } from '../../store/auth.store';
import type { InventoryStockRow, StockMovement, StockTransfer, StockTransferStatus } from '../../types';

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  STOCK_IN: 'Kirim',
  STOCK_OUT: 'Chiqim',
  TRANSFER_IN: 'Transfer (kirim)',
  TRANSFER_OUT: 'Transfer (chiqim)',
  ADJUSTMENT_POSITIVE: "Tuzatish (+)",
  ADJUSTMENT_NEGATIVE: "Tuzatish (-)",
};

const TRANSFER_STATUS_COLORS: Record<StockTransferStatus, string> = {
  DRAFT: 'gold',
  IN_TRANSIT: 'blue',
  COMPLETED: 'green',
  CANCELLED: 'default',
};

function StockTab() {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [actionModal, setActionModal] = useState<{ productId?: string; warehouseId?: string } | null>(null);

  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: listWarehouses });
  const stockQuery = useQuery({
    queryKey: ['inventory-stock', { warehouseId, lowStockOnly, page, pageSize }],
    queryFn: () => listStock({ warehouseId, lowStockOnly: lowStockOnly || undefined, page, pageSize }),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Ombor"
          allowClear
          style={{ width: 200 }}
          options={warehousesQuery.data?.map((w) => ({ label: w.name, value: w.id }))}
          onChange={setWarehouseId}
        />
        <Space>
          <Switch checked={lowStockOnly} onChange={setLowStockOnly} />
          <span>Faqat kam qolganlar</span>
        </Space>
        {hasPermission('inventory', 'CREATE') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setActionModal({})}>
            Yangi harakat
          </Button>
        )}
      </Space>

      <Table<InventoryStockRow>
        rowKey="id"
        loading={stockQuery.isLoading}
        dataSource={stockQuery.data?.items}
        pagination={{
          current: page,
          pageSize,
          total: stockQuery.data?.total,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        columns={[
          { title: 'Mahsulot', dataIndex: ['product', 'name'] },
          { title: 'SKU', dataIndex: ['product', 'sku'] },
          { title: 'Ombor', dataIndex: ['warehouse', 'name'] },
          { title: 'Joriy zaxira', dataIndex: 'quantityOnHand' },
          { title: 'Min. zaxira', dataIndex: ['product', 'minStockLevel'] },
          { title: 'Holat', dataIndex: 'stockStatus', render: (v) => <StockStatusBadge status={v} /> },
          {
            title: 'Oxirgi harakat',
            dataIndex: 'lastMovement',
            render: (movement: StockMovement | null) =>
              movement ? `${MOVEMENT_TYPE_LABELS[movement.movementType]} — ${new Date(movement.createdAt).toLocaleDateString('uz-UZ')}` : '—',
          },
          {
            title: 'Amallar',
            render: (_, record) => (
              <Button size="small" onClick={() => setActionModal({ productId: record.productId, warehouseId: record.warehouseId })}>
                Harakat
              </Button>
            ),
          },
        ]}
      />

      <StockActionModal
        open={!!actionModal}
        onClose={() => setActionModal(null)}
        defaultProductId={actionModal?.productId}
        defaultWarehouseId={actionModal?.warehouseId}
      />
    </div>
  );
}

function MovementsTab() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const movementsQuery = useQuery({
    queryKey: ['inventory-movements', { page, pageSize }],
    queryFn: () => listMovements({ page, pageSize }),
    placeholderData: (prev) => prev,
  });

  return (
    <Table<StockMovement>
      rowKey="id"
      loading={movementsQuery.isLoading}
      dataSource={movementsQuery.data?.items}
      pagination={{
        current: page,
        pageSize,
        total: movementsQuery.data?.total,
        onChange: (p, ps) => {
          setPage(p);
          setPageSize(ps);
        },
      }}
      columns={[
        { title: 'Sana', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('uz-UZ') },
        { title: 'Mahsulot', dataIndex: ['product', 'name'] },
        { title: 'Ombor', dataIndex: ['warehouse', 'name'] },
        { title: 'Turi', dataIndex: 'movementType', render: (v: string) => MOVEMENT_TYPE_LABELS[v] ?? v },
        { title: 'Miqdor', dataIndex: 'quantity' },
        { title: 'Oldingi', dataIndex: 'previousQuantity' },
        { title: 'Yangi', dataIndex: 'balanceAfter' },
        { title: 'Foydalanuvchi', dataIndex: ['performedBy', 'fullName'], render: (v) => v ?? 'tizim' },
        { title: 'Manba', dataIndex: 'referenceType', render: (v) => v ?? '—' },
      ]}
    />
  );
}

function TransfersTab() {
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(1);

  const transfersQuery = useQuery({
    queryKey: ['inventory-transfers', { page }],
    queryFn: () => listTransfers({ page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  const completeMutation = useMutation({
    mutationFn: completeTransfer,
    onSuccess: () => {
      message.success('Transfer bajarildi, zaxira ko\'chirildi');
      queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Bajarib bo‘lmadi');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelTransfer,
    onSuccess: () => {
      message.success('Transfer bekor qilindi');
      queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] });
    },
  });

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        {hasPermission('inventory', 'CREATE') && (
          <Button type="primary" icon={<SwapOutlined />} onClick={() => setModalOpen(true)}>
            Yangi transfer
          </Button>
        )}
      </Space>

      <Table<StockTransfer>
        rowKey="id"
        loading={transfersQuery.isLoading}
        dataSource={transfersQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: transfersQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Qayerdan', dataIndex: ['fromWarehouse', 'name'] },
          { title: 'Qayerga', dataIndex: ['toWarehouse', 'name'] },
          { title: 'Mahsulotlar', dataIndex: 'items', render: (items: StockTransfer['items']) => items.length },
          { title: 'Status', dataIndex: 'status', render: (v: StockTransferStatus) => <Tag color={TRANSFER_STATUS_COLORS[v]}>{v}</Tag> },
          { title: 'So\'ragan', dataIndex: ['requestedBy', 'fullName'] },
          { title: 'Yaratilgan', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('uz-UZ') },
          {
            title: 'Amallar',
            render: (_, record) =>
              record.status === 'DRAFT' &&
              hasPermission('inventory', 'APPROVE') && (
                <Space>
                  <Popconfirm title="Transferni bajarish?" onConfirm={() => completeMutation.mutate(record.id)}>
                    <Button loading={completeMutation.isPending} size="small" type="primary">
                      Bajarish
                    </Button>
                  </Popconfirm>
                  <Popconfirm title="Transferni bekor qilish?" onConfirm={() => cancelMutation.mutate(record.id)}>
                    <Button loading={cancelMutation.isPending} size="small" danger>
                      Bekor qilish
                    </Button>
                  </Popconfirm>
                </Space>
              ),
          },
        ]}
      />

      <CreateTransferModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

export function InventoryPage() {
  const summaryQuery = useQuery({ queryKey: ['inventory-summary'], queryFn: getInventorySummary });

  return (
    <div>
      <LegacyModuleNotice />
      <Typography.Title level={4}>Ombor</Typography.Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Mahsulotlar" value={summaryQuery.data?.totalProducts ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Umumiy zaxira" value={summaryQuery.data?.totalStockQuantity ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Kam qolgan" value={summaryQuery.data?.lowStockCount ?? 0} styles={{ content: { color: '#faad14' } }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Tugagan" value={summaryQuery.data?.outOfStockCount ?? 0} styles={{ content: { color: '#f5222d' } }} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs
          items={[
            { key: 'stock', label: 'Zaxira', children: <StockTab /> },
            { key: 'movements', label: 'Harakatlar tarixi', children: <MovementsTab /> },
            { key: 'transfers', label: 'Transferlar', children: <TransfersTab /> },
          ]}
        />
      </Card>
    </div>
  );
}
