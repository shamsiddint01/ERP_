import { ArrowLeftOutlined, CalculatorOutlined, CheckOutlined, DeleteOutlined, DollarOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addPayrollLine,
  approvePayroll,
  calculatePayroll,
  cancelPayroll,
  getPayroll,
  listPayrollComponents,
  payPayroll,
  removePayrollLine,
} from '../../api/payroll';
import { PageErrorState } from '../../components/PageErrorState';
import { useAuthStore } from '../../store/auth.store';
import type { PayrollComponentType, PayrollLineItem, PayrollStatus } from '../../types';
import { palette } from '../../theme';

const STATUS_COLORS: Record<PayrollStatus, string> = {
  DRAFT: 'default',
  CALCULATING: 'blue',
  CALCULATED: 'blue',
  APPROVED: 'gold',
  PAID: 'green',
  CANCELLED: 'red',
};
const STATUS_LABELS: Record<PayrollStatus, string> = {
  DRAFT: 'Qoralama',
  CALCULATING: 'Hisoblanmoqda',
  CALCULATED: 'Hisoblangan',
  APPROVED: 'Tasdiqlangan',
  PAID: "To'langan",
  CANCELLED: 'Bekor qilingan',
};
const LINE_TYPE_LABELS: Record<string, string> = { BASE: 'Asosiy maosh', OVERTIME: "Qo'shimcha ish", BONUS: 'Bonus', ALLOWANCE: "Qo'shimcha to'lov", DEDUCTION: 'Ushlab qolish' };
const ACTIONABLE_TYPES: PayrollComponentType[] = ['BONUS', 'ALLOWANCE', 'DEDUCTION'];
const METHOD_OPTIONS = [
  { label: 'Naqd (Cash)', value: 'CASH' },
  { label: 'Karta (Card)', value: 'CARD' },
  { label: "O'tkazma (Bank transfer)", value: 'BANK_TRANSFER' },
  { label: 'Onlayn (Online)', value: 'ONLINE' },
  { label: 'Chek (Cheque)', value: 'CHEQUE' },
];

function AddLineModal({ open, onClose, payrollId }: { open: boolean; onClose: () => void; payrollId: string }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const componentsQuery = useQuery({ queryKey: ['payroll-components'], queryFn: listPayrollComponents, enabled: open });

  const mutation = useMutation({
    mutationFn: (values: { type: 'BONUS' | 'ALLOWANCE' | 'DEDUCTION'; componentId?: string; label: string; amount: number }) =>
      addPayrollLine(payrollId, values),
    onSuccess: () => {
      message.success("Qo'shildi");
      queryClient.invalidateQueries({ queryKey: ['payroll', payrollId] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Qo‘shib bo‘lmadi');
    },
  });

  return (
    <Modal title="Qator qo'shish" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="type" label="Turi" rules={[{ required: true }]}>
          <Select
            options={[
              { label: 'Bonus', value: 'BONUS' },
              { label: "Qo'shimcha to'lov (Allowance)", value: 'ALLOWANCE' },
              { label: 'Ushlab qolish (Deduction)', value: 'DEDUCTION' },
            ]}
          />
        </Form.Item>
        <Form.Item name="componentId" label="Tur (ixtiyoriy, oldindan belgilangan)">
          <Select
            allowClear
            loading={componentsQuery.isLoading}
            options={componentsQuery.data?.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(value) => {
              const component = componentsQuery.data?.find((c) => c.id === value);
              if (component) {
                form.setFieldsValue({ label: component.name, amount: component.defaultAmount ? Number(component.defaultAmount) : undefined });
              }
            }}
          />
        </Form.Item>
        <Form.Item name="label" label="Nomi" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="amount" label="Summa" rules={[{ required: true }]}>
          <InputNumber min={0.01} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function PayrollDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [payMethod, setPayMethod] = useState('BANK_TRANSFER');
  const [payModalOpen, setPayModalOpen] = useState(false);

  const payrollQuery = useQuery({ queryKey: ['payroll', id], queryFn: () => getPayroll(id!), enabled: !!id });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['payroll', id] });
    queryClient.invalidateQueries({ queryKey: ['payroll'] });
  }

  function useWorkflowMutation<T>(fn: (...args: T[]) => Promise<unknown>, successMessage: string) {
    return useMutation({
      mutationFn: (arg: T) => fn(arg),
      onSuccess: () => {
        message.success(successMessage);
        invalidate();
      },
      onError: (error: unknown) => {
        const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        message.error(detail ?? 'Amalni bajarib bo‘lmadi');
      },
    });
  }

  const calculateMutation = useWorkflowMutation(calculatePayroll, 'Hisoblandi');
  const approveMutation = useWorkflowMutation(approvePayroll, 'Tasdiqlandi');
  const cancelMutation = useWorkflowMutation((payrollId: string) => cancelPayroll(payrollId), 'Bekor qilindi');
  const removeLineMutation = useMutation({
    mutationFn: (lineId: string) => removePayrollLine(id!, lineId),
    onSuccess: () => {
      message.success("O'chirildi");
      invalidate();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'O‘chirib bo‘lmadi');
    },
  });
  const payMutation = useMutation({
    mutationFn: () => payPayroll(id!, payMethod),
    onSuccess: () => {
      message.success("To'landi");
      invalidate();
      setPayModalOpen(false);
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Amalni bajarib bo‘lmadi');
    },
  });

  if (payrollQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (payrollQuery.isError) {
    return <PageErrorState onRetry={() => payrollQuery.refetch()} />;
  }

  const payroll = payrollQuery.data;
  if (!payroll) return null;

  const canEdit = hasPermission('payroll', 'EDIT');
  const canApprove = hasPermission('payroll', 'APPROVE');
  const canModifyLines = canEdit && ['DRAFT', 'CALCULATED'].includes(payroll.status);

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(`/payroll/periods/${payroll.period.id}`)} style={{ marginBottom: 8 }}>
        Davrga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {payroll.employee.fullName}
            </Typography.Title>
            <Typography.Text type="secondary">
              {payroll.payrollNumber} · {payroll.period.name}
            </Typography.Text>
          </Col>
          <Col>
            <Space>
              <Tag color={STATUS_COLORS[payroll.status]}>{STATUS_LABELS[payroll.status]}</Tag>
              {canEdit && ['DRAFT', 'CALCULATED'].includes(payroll.status) && (
                <Button icon={<CalculatorOutlined />} loading={calculateMutation.isPending} onClick={() => calculateMutation.mutate(id!)}>
                  Hisoblash
                </Button>
              )}
              {canApprove && payroll.status === 'CALCULATED' && (
                <Button type="primary" icon={<CheckOutlined />} loading={approveMutation.isPending} onClick={() => approveMutation.mutate(id!)}>
                  Tasdiqlash
                </Button>
              )}
              {canApprove && payroll.status === 'APPROVED' && (
                <Button type="primary" icon={<DollarOutlined />} onClick={() => setPayModalOpen(true)}>
                  To'lash
                </Button>
              )}
              {canApprove && ['DRAFT', 'CALCULATED', 'APPROVED'].includes(payroll.status) && (
                <Popconfirm title="Bekor qilinsinmi?" onConfirm={() => cancelMutation.mutate(id!)}>
                  <Button loading={cancelMutation.isPending} danger icon={<StopOutlined />}>
                    Bekor qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>

        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }}>
          <Descriptions.Item label="Ishlagan kunlar">{payroll.workedDays ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Qo'shimcha ish (daq)">{payroll.overtimeMinutes}</Descriptions.Item>
          <Descriptions.Item label="Ta'tilsiz kelmagan kunlar">{payroll.unpaidAbsenceDays}</Descriptions.Item>
          {payroll.approvedBy && <Descriptions.Item label="Tasdiqladi">{payroll.approvedBy.fullName}</Descriptions.Item>}
          {payroll.paymentAccount && <Descriptions.Item label="To'lov hisobi">{payroll.paymentAccount.name}</Descriptions.Item>}
          {payroll.cancellationReason && <Descriptions.Item label="Bekor qilish sababi">{payroll.cancellationReason}</Descriptions.Item>}
        </Descriptions>
      </Card>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card size="small">
            <Typography.Text type="secondary">Asosiy</Typography.Text>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {Number(payroll.baseAmount).toLocaleString('uz-UZ')}
            </Typography.Title>
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Typography.Text type="secondary">Qo'shimcha ish</Typography.Text>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {Number(payroll.overtimeAmount).toLocaleString('uz-UZ')}
            </Typography.Title>
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Typography.Text type="secondary">Bonus</Typography.Text>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {Number(payroll.bonusAmount).toLocaleString('uz-UZ')}
            </Typography.Title>
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Typography.Text type="secondary">Ushlab qolish</Typography.Text>
            <Typography.Title level={5} style={{ margin: 0, color: palette.error }}>
              -{Number(payroll.deductionAmount).toLocaleString('uz-UZ')}
            </Typography.Title>
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Typography.Text type="secondary">Jami (Gross)</Typography.Text>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {Number(payroll.grossSalary).toLocaleString('uz-UZ')}
            </Typography.Title>
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Typography.Text type="secondary">Sof (Net)</Typography.Text>
            <Typography.Title level={5} style={{ margin: 0, color: palette.success }}>
              {Number(payroll.netSalary).toLocaleString('uz-UZ')}
            </Typography.Title>
          </Card>
        </Col>
      </Row>

      <Card
        title="Tafsilotlar"
        extra={
          canModifyLines && (
            <Button icon={<PlusOutlined />} onClick={() => setAddLineOpen(true)}>
              Qator qo'shish
            </Button>
          )
        }
      >
        <Table<PayrollLineItem>
          rowKey="id"
          dataSource={payroll.lines}
          pagination={false}
          columns={[
            { title: 'Turi', dataIndex: 'type', render: (v: string) => LINE_TYPE_LABELS[v] ?? v },
            { title: 'Nomi', dataIndex: 'label' },
            { title: 'Summa', dataIndex: 'amount', align: 'right', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
            {
              title: 'Amallar',
              render: (_, record) =>
                canModifyLines &&
                ACTIONABLE_TYPES.includes(record.type as PayrollComponentType) && (
                  <Popconfirm title="O'chirilsinmi?" onConfirm={() => removeLineMutation.mutate(record.id)}>
                    <Button loading={removeLineMutation.isPending} size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ),
            },
          ]}
        />
      </Card>

      <AddLineModal open={addLineOpen} onClose={() => setAddLineOpen(false)} payrollId={id!} />

      <Modal title="Ish haqini to'lash" open={payModalOpen} onCancel={() => setPayModalOpen(false)} onOk={() => payMutation.mutate()} confirmLoading={payMutation.isPending}>
        <Select style={{ width: '100%' }} value={payMethod} onChange={setPayMethod} options={METHOD_OPTIONS} />
      </Modal>
    </div>
  );
}
