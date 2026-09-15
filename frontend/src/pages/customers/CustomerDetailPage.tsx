import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Descriptions, Row, Spin, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { getCustomer, getCustomerHistory } from '../../api/customers';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const customerQuery = useQuery({ queryKey: ['customer', id], queryFn: () => getCustomer(id!), enabled: !!id });
  const historyQuery = useQuery({ queryKey: ['customer-history', id], queryFn: () => getCustomerHistory(id!), enabled: !!id });

  if (customerQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const customer = customerQuery.data;
  if (!customer) return null;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/customers')} style={{ marginBottom: 8 }}>
        Mijozlar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {customer.name}
            </Typography.Title>
            {customer.companyName && <Typography.Text type="secondary">{customer.companyName}</Typography.Text>}
          </Col>
          <Col>
            <Tag color={customer.status === 'ACTIVE' ? 'green' : 'default'}>{customer.status === 'ACTIVE' ? 'Faol' : 'Nofaol'}</Tag>
          </Col>
        </Row>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }}>
          <Descriptions.Item label="Telefon">{customer.phone}</Descriptions.Item>
          <Descriptions.Item label="Email">{customer.email ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Manzil">{customer.address ?? '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic title="Balans (qarzdorlik)" value={Number(customer.balance)} suffix="UZS" />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Kredit limiti" value={Number(customer.creditLimit)} suffix="UZS" />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Buyurtmalar" value={customer._count.orders} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs
          items={[
            {
              key: 'orders',
              label: `Buyurtmalar (${historyQuery.data?.orders.length ?? 0})`,
              children: historyQuery.data?.orders.length ? (
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={historyQuery.data.orders}
                  pagination={false}
                  columns={[
                    { title: 'Raqam', dataIndex: 'orderNumber' },
                    { title: 'Status', dataIndex: 'status' },
                    { title: 'Summa', dataIndex: 'grandTotal' },
                    { title: 'Sana', dataIndex: 'orderDate' },
                  ]}
                />
              ) : (
                <Alert type="info" showIcon title="Hali buyurtmalar yo'q" description="Sales/Orders moduli qurilgach bu yerda ko'rinadi." />
              ),
            },
            {
              key: 'invoices',
              label: `Hisob-fakturalar (${historyQuery.data?.invoices.length ?? 0})`,
              children: historyQuery.data?.invoices.length ? (
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={historyQuery.data.invoices}
                  pagination={false}
                  columns={[
                    { title: 'Raqam', dataIndex: 'invoiceNumber' },
                    { title: 'Status', dataIndex: 'status' },
                    { title: 'Summa', dataIndex: 'grandTotal' },
                    { title: 'Muddat', dataIndex: 'dueDate' },
                  ]}
                />
              ) : (
                <Alert type="info" showIcon title="Hali hisob-fakturalar yo'q" description="Invoices moduli qurilgach bu yerda ko'rinadi." />
              ),
            },
            {
              key: 'payments',
              label: `To'lovlar (${historyQuery.data?.payments.length ?? 0})`,
              children: historyQuery.data?.payments.length ? (
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={historyQuery.data.payments}
                  pagination={false}
                  columns={[
                    { title: 'Raqam', dataIndex: 'paymentNumber' },
                    { title: 'Summa', dataIndex: 'amount' },
                    { title: 'Usul', dataIndex: 'method' },
                    { title: 'Status', dataIndex: 'status' },
                  ]}
                />
              ) : (
                <Alert type="info" showIcon title="Hali to'lovlar yo'q" description="Payments moduli qurilgach bu yerda ko'rinadi." />
              ),
            },
            {
              key: 'activity',
              label: `Activity (${historyQuery.data?.activity.length ?? 0})`,
              children: (
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={historyQuery.data?.activity}
                  pagination={false}
                  columns={[
                    { title: 'Vaqt', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('uz-UZ') },
                    { title: 'Kim', dataIndex: ['actor', 'fullName'] },
                    { title: 'Amal', dataIndex: 'action' },
                    { title: 'Tavsif', dataIndex: 'description' },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
