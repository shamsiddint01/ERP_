import { ArrowLeftOutlined, DollarOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Descriptions, Form, Input, Modal, Popconfirm, Row, Space, Spin, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cancelTuitionCharge, getTuitionCharge, updateTuitionCharge } from '../../api/tuition';
import { PageErrorState } from '../../components/PageErrorState';
import { RecordTuitionPaymentModal } from '../../components/RecordTuitionPaymentModal';
import { useAuthStore } from '../../store/auth.store';
import type { TuitionChargeStatus } from '../../types';

const STATUS_COLORS: Record<TuitionChargeStatus, string> = {
  PENDING: 'blue',
  PARTIALLY_PAID: 'orange',
  PAID: 'green',
  OVERDUE: 'red',
  CANCELLED: 'default',
};

const STATUS_LABELS: Record<TuitionChargeStatus, string> = {
  PENDING: 'Kutilmoqda',
  PARTIALLY_PAID: 'Qisman to‘langan',
  PAID: "To'langan",
  OVERDUE: 'Muddati o‘tgan',
  CANCELLED: 'Bekor qilingan',
};

export function TuitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();

  const chargeQuery = useQuery({ queryKey: ['tuition-charge', id], queryFn: () => getTuitionCharge(id!), enabled: !!id });

  const cancelMutation = useMutation({
    mutationFn: () => cancelTuitionCharge(id!),
    onSuccess: () => {
      message.success('Hisob bekor qilindi');
      queryClient.invalidateQueries({ queryKey: ['tuition-charge', id] });
      queryClient.invalidateQueries({ queryKey: ['tuition-charges'] });
      queryClient.invalidateQueries({ queryKey: ['student-balance'] });
      queryClient.invalidateQueries({ queryKey: ['student-financial-summary'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Bekor qilib bo'lmadi");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: { dueDate: dayjs.Dayjs; description?: string }) =>
      updateTuitionCharge(id!, { dueDate: values.dueDate.toISOString(), description: values.description }),
    onSuccess: () => {
      message.success('Yangilandi');
      queryClient.invalidateQueries({ queryKey: ['tuition-charge', id] });
      queryClient.invalidateQueries({ queryKey: ['tuition-charges'] });
      setEditOpen(false);
    },
    onError: () => message.error("Yangilab bo'lmadi"),
  });

  if (chargeQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (chargeQuery.isError) {
    return <PageErrorState onRetry={() => chargeQuery.refetch()} />;
  }

  const charge = chargeQuery.data;
  if (!charge) return null;

  const allocated = charge.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
  const outstanding = Number(charge.netAmount) - allocated;
  const canRecordPayment = hasPermission('payments', 'CREATE') && hasPermission('tuition', 'EDIT');
  const canEdit = hasPermission('tuition', 'EDIT');
  const canCancel = hasPermission('tuition', 'APPROVE');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/tuition')} style={{ marginBottom: 8 }}>
        Ro'yxatga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {charge.billingPeriod} — {charge.student.fullName}
            </Typography.Title>
            <Typography.Text type="secondary">
              {charge.student.studentCode} · {charge.enrollment.group.name}
            </Typography.Text>
          </Col>
          <Col>
            <Space>
              <Tag color={STATUS_COLORS[charge.status]}>{STATUS_LABELS[charge.status]}</Tag>
              {outstanding > 0 && charge.status !== 'CANCELLED' && canRecordPayment && (
                <Button type="primary" icon={<DollarOutlined />} onClick={() => setPaymentOpen(true)}>
                  To'lov qabul qilish
                </Button>
              )}
              {canEdit && charge.status !== 'CANCELLED' && (
                <Button
                  icon={<EditOutlined />}
                  onClick={() => {
                    form.setFieldsValue({ dueDate: dayjs(charge.dueDate), description: charge.description ?? undefined });
                    setEditOpen(true);
                  }}
                >
                  Tahrirlash
                </Button>
              )}
              {canCancel && charge.status !== 'CANCELLED' && charge.allocations.length === 0 && (
                <Popconfirm title="Ushbu hisobni bekor qilishni tasdiqlaysizmi?" onConfirm={() => cancelMutation.mutate()}>
                  <Button loading={cancelMutation.isPending} danger icon={<StopOutlined />}>
                    Bekor qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
          <Descriptions.Item label="Summa">{Number(charge.amount).toLocaleString('uz-UZ')}</Descriptions.Item>
          <Descriptions.Item label="Chegirma">{Number(charge.discountAmount).toLocaleString('uz-UZ')}</Descriptions.Item>
          <Descriptions.Item label="Sof summa">{Number(charge.netAmount).toLocaleString('uz-UZ')}</Descriptions.Item>
          <Descriptions.Item label="To'langan">{allocated.toLocaleString('uz-UZ')}</Descriptions.Item>
          <Descriptions.Item label="Qoldiq">{outstanding.toLocaleString('uz-UZ')}</Descriptions.Item>
          <Descriptions.Item label="Muddati">{new Date(charge.dueDate).toLocaleDateString('uz-UZ')}</Descriptions.Item>
          <Descriptions.Item label="Izoh" span={2}>
            {charge.description ?? '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="To'lovlar tarixi">
        <Table
          size="small"
          rowKey="id"
          dataSource={charge.allocations}
          pagination={false}
          locale={{ emptyText: "Hali to'lov qilinmagan" }}
          columns={[
            { title: 'To\'lov raqami', dataIndex: ['payment', 'paymentNumber'] },
            { title: 'Usul', dataIndex: ['payment', 'method'] },
            { title: 'Summa', dataIndex: 'amount', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
            { title: 'Sana', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('uz-UZ') },
            { title: 'Kim qabul qildi', dataIndex: ['allocatedBy', 'fullName'] },
          ]}
        />
      </Card>

      <RecordTuitionPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        studentId={charge.studentId}
        tuitionChargeId={charge.id}
        outstanding={outstanding}
      />

      <Modal
        title="Hisobni tahrirlash"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={updateMutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => updateMutation.mutate(values)}>
          <Form.Item name="dueDate" label="To'lov muddati" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="Izoh">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
