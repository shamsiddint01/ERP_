import { ArrowLeftOutlined, DollarOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Input, Modal, Row, Space, Spin, Table, Tag, Timeline, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listAuditLogs } from '../../api/auditLog';
import { openInvoicePdf } from '../../api/invoices';
import { cancelOrder, completeOrder, confirmOrder, getOrder, processOrder } from '../../api/orders';
import { RecordPaymentModal } from '../../components/RecordPaymentModal';
import { useAuthStore } from '../../store/auth.store';
import type { OrderItem, OrderPaymentStatus, OrderStatus } from '../../types';

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

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const orderQuery = useQuery({ queryKey: ['order', id], queryFn: () => getOrder(id!), enabled: !!id });
  const activityQuery = useQuery({
    queryKey: ['audit-logs', 'Order', id],
    queryFn: () => listAuditLogs(1, 50, { entityType: 'Order', entityId: id }),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['order', id] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    queryClient.invalidateQueries({ queryKey: ['audit-logs', 'Order', id] });
  };

  function useTransition(fn: (id: string) => Promise<unknown>, successMessage: string) {
    return useMutation({
      mutationFn: () => fn(id!),
      onSuccess: () => {
        message.success(successMessage);
        invalidate();
        queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      },
      onError: (error: unknown) => {
        const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        message.error(detail ?? 'Amalni bajarib bo‘lmadi');
      },
    });
  }

  const confirmMutation = useTransition(confirmOrder, 'Buyurtma tasdiqlandi, zaxira rezerv qilindi');
  const processMutation = useTransition(processOrder, "Buyurtma jarayonga o'tkazildi");
  const completeMutation = useTransition(completeOrder, "Buyurtma yakunlandi, hisob-faktura yaratildi");
  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(id!, cancelReason),
    onSuccess: () => {
      message.success('Buyurtma bekor qilindi');
      invalidate();
      setCancelModalOpen(false);
      setCancelReason('');
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Bekor qilib bo‘lmadi');
    },
  });

  if (orderQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const order = orderQuery.data;
  if (!order) return null;

  const canEdit = hasPermission('orders', 'EDIT');
  const canApprove = hasPermission('orders', 'APPROVE');
  const canRecordPayment = hasPermission('payments', 'CREATE');
  const remaining = Number(order.grandTotal) - Number(order.amountPaid);
  const invoice = order.invoices[0];

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/orders')} style={{ marginBottom: 8 }}>
        Ro'yxatga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {order.orderNumber}
            </Typography.Title>
            <Typography.Text type="secondary">{order.customer.companyName ?? order.customer.name}</Typography.Text>
          </Col>
          <Col>
            <Space>
              <Tag color={STATUS_COLORS[order.status]}>{STATUS_LABELS[order.status]}</Tag>
              {order.status === 'DRAFT' && canEdit && (
                <Button type="primary" loading={confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
                  Tasdiqlash
                </Button>
              )}
              {order.status === 'CONFIRMED' && canEdit && (
                <Button type="primary" loading={processMutation.isPending} onClick={() => processMutation.mutate()}>
                  Jarayonga o'tkazish
                </Button>
              )}
              {order.status === 'PROCESSING' && canApprove && (
                <Button type="primary" loading={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
                  Yakunlash
                </Button>
              )}
              {['DRAFT', 'CONFIRMED', 'PROCESSING'].includes(order.status) && canEdit && (
                <Button danger onClick={() => setCancelModalOpen(true)}>
                  Bekor qilish
                </Button>
              )}
            </Space>
          </Col>
        </Row>
        <Descriptions column={3} style={{ marginTop: 16 }}>
          <Descriptions.Item label="Ombor">{order.warehouse.name}</Descriptions.Item>
          <Descriptions.Item label="Sana">{new Date(order.orderDate).toLocaleDateString('uz-UZ')}</Descriptions.Item>
          <Descriptions.Item label="Mas'ul xodim">{order.responsibleEmployee?.fullName ?? '—'}</Descriptions.Item>
          {order.confirmedAt && <Descriptions.Item label="Tasdiqlangan">{new Date(order.confirmedAt).toLocaleString('uz-UZ')}</Descriptions.Item>}
          {order.completedAt && <Descriptions.Item label="Yakunlangan">{new Date(order.completedAt).toLocaleString('uz-UZ')}</Descriptions.Item>}
          {order.cancelledAt && <Descriptions.Item label="Bekor qilingan sabab">{order.cancellationReason}</Descriptions.Item>}
        </Descriptions>
      </Card>

      <Row gutter={24}>
        <Col span={16}>
          <Card title="Mahsulotlar" style={{ marginBottom: 24 }}>
            <Table<OrderItem>
              rowKey="id"
              dataSource={order.items}
              pagination={false}
              columns={[
                { title: 'Mahsulot', dataIndex: ['product', 'name'] },
                { title: 'SKU', dataIndex: ['product', 'sku'] },
                { title: 'Miqdor', dataIndex: 'quantity' },
                { title: 'Narx', dataIndex: 'unitPrice' },
                { title: 'Soliq %', dataIndex: 'taxPercent' },
                { title: 'Jami', dataIndex: 'lineTotal' },
              ]}
            />
            <Row justify="end" style={{ marginTop: 16 }}>
              <Col style={{ textAlign: 'right', minWidth: 240 }}>
                <div>Oraliq summa: {Number(order.subtotal).toLocaleString('uz-UZ')}</div>
                <div>Soliq: {Number(order.taxTotal).toLocaleString('uz-UZ')}</div>
                <div>Chegirma: {Number(order.discountTotal).toLocaleString('uz-UZ')}</div>
                <Typography.Title level={5}>Jami: {Number(order.grandTotal).toLocaleString('uz-UZ')}</Typography.Title>
              </Col>
            </Row>
          </Card>

          <Card title="Activity">
            <Timeline
              items={activityQuery.data?.items.map((entry) => ({
                children: (
                  <div>
                    <Typography.Text strong>{entry.action}</Typography.Text> — {entry.description}
                    <div>
                      <Typography.Text type="secondary">{new Date(entry.createdAt).toLocaleString('uz-UZ')}</Typography.Text>
                    </div>
                  </div>
                ),
              }))}
            />
          </Card>
        </Col>

        <Col span={8}>
          <Card title="To'lov ma'lumoti" style={{ marginBottom: 24 }}>
            <Descriptions column={1}>
              <Descriptions.Item label="Status">
                <Tag color={PAYMENT_STATUS_COLORS[order.paymentStatus]}>{order.paymentStatus}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="To'langan">{Number(order.amountPaid).toLocaleString('uz-UZ')}</Descriptions.Item>
              <Descriptions.Item label="Qolgan">{remaining.toLocaleString('uz-UZ')}</Descriptions.Item>
            </Descriptions>
            {remaining > 0 && canRecordPayment && order.status !== 'CANCELLED' && (
              <Button type="primary" icon={<DollarOutlined />} block onClick={() => setPaymentModalOpen(true)}>
                To'lov qabul qilish
              </Button>
            )}
          </Card>

          <Card title="Hisob-faktura">
            {invoice ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>{invoice.invoiceNumber}</div>
                <Tag>{invoice.status}</Tag>
                <Button icon={<FilePdfOutlined />} onClick={() => openInvoicePdf(invoice.id, invoice.invoiceNumber)}>
                  PDF yuklab olish
                </Button>
              </Space>
            ) : (
              <Typography.Text type="secondary">Buyurtma yakunlanganda avtomatik yaratiladi.</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      <RecordPaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        referenceType="ORDER"
        referenceId={order.id}
        remaining={remaining}
      />

      <Modal
        title="Buyurtmani bekor qilish"
        open={cancelModalOpen}
        onCancel={() => setCancelModalOpen(false)}
        onOk={() => cancelMutation.mutate()}
        confirmLoading={cancelMutation.isPending}
      >
        <Typography.Paragraph>Bekor qilish sababini kiriting:</Typography.Paragraph>
        <Input.TextArea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} />
      </Modal>
    </div>
  );
}
