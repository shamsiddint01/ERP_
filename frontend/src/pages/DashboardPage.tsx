import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, Row, Statistic, Table, Typography } from 'antd';
import { getDashboardSummary } from '../api/dashboard';
import { useAuthStore } from '../store/auth.store';
import type { StockMovement } from '../types';

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  STOCK_IN: 'Kirim',
  STOCK_OUT: 'Chiqim',
  TRANSFER_IN: 'Transfer (kirim)',
  TRANSFER_OUT: 'Transfer (chiqim)',
  ADJUSTMENT_POSITIVE: "Tuzatish (+)",
  ADJUSTMENT_NEGATIVE: "Tuzatish (-)",
};

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const summaryQuery = useQuery({ queryKey: ['dashboard-summary'], queryFn: getDashboardSummary });

  return (
    <div>
      <Typography.Title level={3}>Xush kelibsiz, {user?.fullName}</Typography.Title>
      <Alert
        style={{ marginBottom: 24 }}
        type="info"
        showIcon
        title="Customers/Products/Inventory statistikasi jonli"
        description="Daromad, xarajat va sotuvlar bo'yicha moliyaviy statistikalar Sales/Finance modullari qurilgach (keyingi bosqichlarda) shu yerga qo'shiladi."
      />
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card>
            <Statistic title="Mijozlar" value={summaryQuery.data?.customersCount ?? 0} loading={summaryQuery.isLoading} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="Mahsulotlar" value={summaryQuery.data?.productsCount ?? 0} loading={summaryQuery.isLoading} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="Yetkazib beruvchilar" value={summaryQuery.data?.suppliersCount ?? 0} loading={summaryQuery.isLoading} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="Kutilayotgan xaridlar" value={summaryQuery.data?.pendingPurchaseOrdersCount ?? 0} loading={summaryQuery.isLoading} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Kam qolgan mahsulotlar"
              value={summaryQuery.data?.lowStockCount ?? 0}
              loading={summaryQuery.isLoading}
              styles={{ content: { color: '#faad14' } }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Tugagan mahsulotlar"
              value={summaryQuery.data?.outOfStockCount ?? 0}
              loading={summaryQuery.isLoading}
              styles={{ content: { color: '#f5222d' } }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="So'nggi ombor harakatlari">
        <Table<StockMovement>
          size="small"
          rowKey="id"
          loading={summaryQuery.isLoading}
          dataSource={summaryQuery.data?.recentMovements}
          pagination={false}
          columns={[
            { title: 'Sana', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('uz-UZ') },
            { title: 'Mahsulot', dataIndex: ['product', 'name'] },
            { title: 'Ombor', dataIndex: ['warehouse', 'name'] },
            { title: 'Turi', dataIndex: 'movementType', render: (v: string) => MOVEMENT_TYPE_LABELS[v] ?? v },
            { title: 'Miqdor', dataIndex: 'quantity' },
          ]}
        />
      </Card>
    </div>
  );
}
