import { ArrowLeftOutlined, DollarOutlined, InboxOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Form, InputNumber, Modal, Popconfirm, Row, Space, Spin, Table, Tag, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  getPurchaseOrder,
  receivePurchaseOrder,
  submitPurchaseOrder,
  type ReceiveItemPayload,
} from '../../api/purchases';
import { RecordPaymentModal } from '../../components/RecordPaymentModal';
import { useAuthStore } from '../../store/auth.store';
import type { PurchaseOrderItem, PurchaseOrderStatus } from '../../types';

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

function ReceiveModal({ open, onClose, items, poId }: { open: boolean; onClose: () => void; items: PurchaseOrderItem[]; poId: string }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const pendingItems = items.filter((item) => Number(item.quantityReceived) < Number(item.quantity));

  const mutation = useMutation({
    mutationFn: (values: Record<string, number>) => {
      const payload: ReceiveItemPayload[] = pendingItems
        .map((item) => ({ purchaseOrderItemId: item.id, quantityReceived: values[item.id] }))
        .filter((entry) => entry.quantityReceived > 0);
      return receivePurchaseOrder(poId, payload);
    },
    onSuccess: () => {
      message.success('Zaxira qabul qilindi');
      queryClient.invalidateQueries({ queryKey: ['purchase-order', poId] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Qabul qilib bo‘lmadi');
    },
  });

  return (
    <Modal title="Tovarlarni qabul qilish" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        {pendingItems.map((item) => {
          const remaining = Number(item.quantity) - Number(item.quantityReceived);
          return (
            <Form.Item
              key={item.id}
              name={item.id}
              label={`${item.product.name} (qolgan: ${remaining} ${item.product.unit})`}
              initialValue={remaining}
              rules={[{ required: true }]}
            >
              <InputNumber min={0} max={remaining} style={{ width: '100%' }} />
            </Form.Item>
          );
        })}
      </Form>
    </Modal>
  );
}

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const poQuery = useQuery({ queryKey: ['purchase-order', id], queryFn: () => getPurchaseOrder(id!), enabled: !!id });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
    queryClient.invalidateQueries({ queryKey: ['purchases'] });
  };

  const submitMutation = useMutation({
    mutationFn: () => submitPurchaseOrder(id!),
    onSuccess: () => {
      message.success('Buyurtma yuborildi');
      invalidate();
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => approvePurchaseOrder(id!),
    onSuccess: () => {
      message.success('Buyurtma tasdiqlandi');
      invalidate();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelPurchaseOrder(id!),
    onSuccess: () => {
      message.success('Buyurtma bekor qilindi');
      invalidate();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Bekor qilib bo‘lmadi');
    },
  });

  if (poQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const po = poQuery.data;
  if (!po) return null;

  const canEdit = hasPermission('purchases', 'EDIT');
  const canApprove = hasPermission('purchases', 'APPROVE');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/purchases')} style={{ marginBottom: 8 }}>
        Buyurtmalar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {po.poNumber}
            </Typography.Title>
            <Typography.Text type="secondary">{po.supplier.companyName}</Typography.Text>
          </Col>
          <Col>
            <Space>
              <Tag color={STATUS_COLORS[po.status]}>{STATUS_LABELS[po.status]}</Tag>
              {po.status === 'DRAFT' && canEdit && (
                <Button type="primary" onClick={() => submitMutation.mutate()} loading={submitMutation.isPending}>
                  Yuborish
                </Button>
              )}
              {po.status === 'PENDING' && canApprove && (
                <Button type="primary" onClick={() => approveMutation.mutate()} loading={approveMutation.isPending}>
                  Tasdiqlash
                </Button>
              )}
              {(po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED') && canApprove && (
                <Button type="primary" icon={<InboxOutlined />} onClick={() => setReceiveModalOpen(true)}>
                  Qabul qilish
                </Button>
              )}
              {['RECEIVED', 'PARTIALLY_RECEIVED'].includes(po.status) &&
                Number(po.amountPaid) < Number(po.grandTotal) &&
                hasPermission('payments', 'CREATE') && (
                  <Button icon={<DollarOutlined />} onClick={() => setPaymentModalOpen(true)}>
                    To'lov qilish
                  </Button>
                )}
              {['DRAFT', 'PENDING', 'APPROVED'].includes(po.status) && canEdit && (
                <Popconfirm title="Buyurtmani bekor qilish?" onConfirm={() => cancelMutation.mutate()}>
                  <Button danger loading={cancelMutation.isPending}>
                    Bekor qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>
        <Descriptions column={3} style={{ marginTop: 16 }}>
          <Descriptions.Item label="Ombor">{po.warehouse.name}</Descriptions.Item>
          <Descriptions.Item label="Sana">{new Date(po.orderDate).toLocaleDateString('uz-UZ')}</Descriptions.Item>
          <Descriptions.Item label="Yaratdi">{po.createdBy?.fullName ?? '—'}</Descriptions.Item>
          {po.approvedBy && <Descriptions.Item label="Tasdiqladi">{po.approvedBy.fullName}</Descriptions.Item>}
          <Descriptions.Item label="To'langan">
            {Number(po.amountPaid).toLocaleString('uz-UZ')} / {Number(po.grandTotal).toLocaleString('uz-UZ')} ({po.paymentStatus})
          </Descriptions.Item>
          {po.notes && <Descriptions.Item label="Izoh">{po.notes}</Descriptions.Item>}
        </Descriptions>
      </Card>

      <Card title="Mahsulotlar">
        <Table<PurchaseOrderItem>
          rowKey="id"
          dataSource={po.items}
          pagination={false}
          columns={[
            { title: 'Mahsulot', dataIndex: ['product', 'name'] },
            { title: 'SKU', dataIndex: ['product', 'sku'] },
            { title: 'Miqdor', dataIndex: 'quantity' },
            { title: 'Narx', dataIndex: 'unitPrice' },
            { title: 'Soliq %', dataIndex: 'taxPercent' },
            { title: 'Jami', dataIndex: 'lineTotal' },
            { title: 'Qabul qilingan', dataIndex: 'quantityReceived' },
          ]}
        />
        <Row justify="end" style={{ marginTop: 16 }}>
          <Col style={{ textAlign: 'right', minWidth: 240 }}>
            <div>Oraliq summa: {Number(po.subtotal).toLocaleString('uz-UZ')}</div>
            <div>Soliq: {Number(po.taxTotal).toLocaleString('uz-UZ')}</div>
            <div>Chegirma: {Number(po.discountTotal).toLocaleString('uz-UZ')}</div>
            <Typography.Title level={5}>Jami: {Number(po.grandTotal).toLocaleString('uz-UZ')}</Typography.Title>
          </Col>
        </Row>
      </Card>

      <ReceiveModal open={receiveModalOpen} onClose={() => setReceiveModalOpen(false)} items={po.items} poId={po.id} />
      <RecordPaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        referenceType="PURCHASE_ORDER"
        referenceId={po.id}
        remaining={Number(po.grandTotal) - Number(po.amountPaid)}
      />
    </div>
  );
}
