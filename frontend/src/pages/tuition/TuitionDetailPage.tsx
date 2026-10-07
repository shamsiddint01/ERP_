import { DeleteOutlined, DollarOutlined, EditOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, DatePicker, Form, Input, Modal, Popconfirm, Spin, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cancelTuitionCharge, getTuitionCharge, updateTuitionCharge } from '../../api/tuition';
import { ActionBar } from '../../components/ActionBar';
import { DetailHeader } from '../../components/DetailHeader';
import { DetailSection } from '../../components/DetailSection';
import { InfoGrid } from '../../components/InfoGrid';
import { PageErrorState } from '../../components/PageErrorState';
import { ChargeStateTag } from '../../components/PaymentStateTag';
import { RecordTuitionPaymentModal } from '../../components/RecordTuitionPaymentModal';
import { useAuthStore } from '../../store/auth.store';

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
      message.success("Hisob o'chirildi");
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
      <DetailHeader
        backLabel="Ro'yxatga qaytish"
        onBack={() => navigate('/tuition')}
        title={
          <>
            {charge.billingPeriod} — {charge.student.fullName}
          </>
        }
        subtitle={
          <>
            {charge.student.studentCode} · {charge.enrollment.group.name}
          </>
        }
        actions={
          <ActionBar>
            {charge.status === 'CANCELLED' ? <Tag>O'chirilgan</Tag> : <ChargeStateTag charge={charge} />}
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
              <Popconfirm title="Ushbu hisobni o'chirishni tasdiqlaysizmi?" onConfirm={() => cancelMutation.mutate()}>
                <Button loading={cancelMutation.isPending} danger icon={<DeleteOutlined />}>
                  O'chirish
                </Button>
              </Popconfirm>
            )}
          </ActionBar>
        }
      >
        <InfoGrid
          column={{ xs: 1, sm: 2 }}
          items={[
            { label: 'Summa', value: Number(charge.amount).toLocaleString('uz-UZ') },
            { label: 'Chegirma', value: Number(charge.discountAmount).toLocaleString('uz-UZ') },
            { label: 'Sof summa', value: Number(charge.netAmount).toLocaleString('uz-UZ') },
            { label: "To'langan", value: allocated.toLocaleString('uz-UZ') },
            { label: 'Qoldiq', value: outstanding.toLocaleString('uz-UZ') },
            { label: 'Muddati', value: new Date(charge.dueDate).toLocaleDateString('uz-UZ') },
            { label: 'Izoh', value: charge.description, span: 2 },
          ]}
        />
      </DetailHeader>

      <DetailSection title="To'lovlar tarixi">
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
      </DetailSection>

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
