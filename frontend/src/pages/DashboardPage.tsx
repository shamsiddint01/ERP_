import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Statistic, Table, Typography } from 'antd';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getDashboardSummary, getRevenueChart } from '../api/dashboard';
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
  const revenueChartQuery = useQuery({ queryKey: ['revenue-chart'], queryFn: () => getRevenueChart(14) });

  return (
    <div>
      <Typography.Title level={3}>Xush kelibsiz, {user?.fullName}</Typography.Title>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Jami daromad (yakunlangan sotuvlar)" value={summaryQuery.data?.totalRevenue ?? 0} loading={summaryQuery.isLoading} suffix="UZS" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Buyurtmalar" value={summaryQuery.data?.ordersCount ?? 0} loading={summaryQuery.isLoading} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Kutilayotgan buyurtmalar"
              value={summaryQuery.data?.pendingOrdersCount ?? 0}
              loading={summaryQuery.isLoading}
              styles={{ content: { color: '#1677ff' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Kutilayotgan to'lovlar"
              value={summaryQuery.data?.outstandingPaymentsAmount ?? 0}
              loading={summaryQuery.isLoading}
              suffix="UZS"
              styles={{ content: { color: '#faad14' } }}
            />
          </Card>
        </Col>
      </Row>

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
            <Statistic title="To'langan hisob-fakturalar" value={summaryQuery.data?.paidInvoicesCount ?? 0} loading={summaryQuery.isLoading} />
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

      <Card title="Daromad dinamikasi (so'nggi 14 kun)" style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={revenueChartQuery.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => Number(value).toLocaleString('uz-UZ')} />
            <Line type="monotone" dataKey="revenue" stroke="#1677ff" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

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
