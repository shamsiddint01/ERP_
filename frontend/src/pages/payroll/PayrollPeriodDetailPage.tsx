import { ArrowLeftOutlined, CalculatorOutlined, CheckOutlined, DollarOutlined, DownloadOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Modal, Popconfirm, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  approvePayroll,
  calculatePayroll,
  cancelPayroll,
  downloadPayrollReport,
  generatePayroll,
  getPayrollPeriod,
  getPayrollPeriodSummary,
  listPayroll,
  payPayroll,
} from '../../api/payroll';
import { useAuthStore } from '../../store/auth.store';
import type { PayrollListItem, PayrollStatus } from '../../types';

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

const METHOD_OPTIONS = [
  { label: 'Naqd (Cash)', value: 'CASH' },
  { label: 'Karta (Card)', value: 'CARD' },
  { label: "O'tkazma (Bank transfer)", value: 'BANK_TRANSFER' },
  { label: 'Onlayn (Online)', value: 'ONLINE' },
  { label: 'Chek (Cheque)', value: 'CHEQUE' },
];

function PayModal({ open, onClose, payrollId }: { open: boolean; onClose: () => void; payrollId: string | null }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<string>('BANK_TRANSFER');

  const mutation = useMutation({
    mutationFn: () => payPayroll(payrollId!, method),
    onSuccess: () => {
      message.success("To'landi");
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-period-summary'] });
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Amalni bajarib bo‘lmadi');
    },
  });

  return (
    <Modal title="Ish haqini to'lash" open={open} onCancel={onClose} onOk={() => mutation.mutate()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Select style={{ width: '100%' }} value={method} onChange={setMethod} options={METHOD_OPTIONS} />
    </Modal>
  );
}

export function PayrollPeriodDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [payModalPayrollId, setPayModalPayrollId] = useState<string | null>(null);

  const summaryQuery = useQuery({ queryKey: ['payroll-period-summary', id], queryFn: () => getPayrollPeriodSummary(id!), enabled: !!id });
  const periodQuery = useQuery({ queryKey: ['payroll-period', id], queryFn: () => getPayrollPeriod(id!), enabled: !!id });
  const payrollQuery = useQuery({
    queryKey: ['payroll', { periodId: id }],
    queryFn: () => listPayroll({ periodId: id, pageSize: 100 }),
    enabled: !!id,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['payroll', { periodId: id }] });
    queryClient.invalidateQueries({ queryKey: ['payroll-period-summary', id] });
  }

  const generateMutation = useMutation({
    mutationFn: () => generatePayroll({ periodId: id! }),
    onSuccess: (result) => {
      message.success(`${result.created} ta ish haqi yozuvi yaratildi (${result.skipped} ta o'tkazib yuborildi)`);
      invalidate();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Amalni bajarib bo‘lmadi');
    },
  });

  function useWorkflowMutation(fn: (id: string) => Promise<unknown>, successMessage: string) {
    return useMutation({
      mutationFn: fn,
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
  const cancelMutation = useWorkflowMutation((id) => cancelPayroll(id), 'Bekor qilindi');

  async function handleExport() {
    try {
      await downloadPayrollReport({ type: 'by-employee', periodId: id });
    } catch {
      message.error('Eksport qilib bo‘lmadi');
    }
  }

  const canCreate = hasPermission('payroll', 'CREATE');
  const canEdit = hasPermission('payroll', 'EDIT');
  const canApprove = hasPermission('payroll', 'APPROVE');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/payroll')} style={{ marginBottom: 8 }}>
        Davrlar ro'yxatiga qaytish
      </Button>

      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {periodQuery.data?.name}
        </Typography.Title>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Eksport
          </Button>
          {canCreate && periodQuery.data?.status === 'OPEN' && (
            <Button type="primary" icon={<PlusOutlined />} loading={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
              Ish haqilarni generatsiya qilish
            </Button>
          )}
        </Space>
      </Space>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Xodimlar" value={summaryQuery.data?.employeeCount ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Jami (Gross)" value={summaryQuery.data?.grossTotal ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Ushlab qolinganlar" value={summaryQuery.data?.deductionsTotal ?? 0} styles={{ content: { color: '#f5222d' } }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Sof (Net)" value={summaryQuery.data?.netTotal ?? 0} styles={{ content: { color: '#3f8600' } }} />
          </Card>
        </Col>
      </Row>

      <Table<PayrollListItem>
        rowKey="id"
        loading={payrollQuery.isLoading}
        dataSource={payrollQuery.data?.items}
        pagination={false}
        columns={[
          { title: 'Raqam', dataIndex: 'payrollNumber' },
          {
            title: 'Xodim',
            render: (_, record) => (
              <a onClick={() => navigate(`/payroll/${record.id}`)}>{record.employee.fullName}</a>
            ),
          },
          { title: "Bo'lim", render: (_, record) => record.employee.department?.name ?? '—' },
          { title: 'Jami', dataIndex: 'grossSalary', align: 'right', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          { title: 'Sof', dataIndex: 'netSalary', align: 'right', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          { title: 'Status', dataIndex: 'status', render: (v: PayrollStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          {
            title: 'Amallar',
            render: (_, record) => (
              <Space>
                {canEdit && ['DRAFT', 'CALCULATED'].includes(record.status) && (
                  <Button size="small" icon={<CalculatorOutlined />} loading={calculateMutation.isPending} onClick={() => calculateMutation.mutate(record.id)}>
                    Hisoblash
                  </Button>
                )}
                {canApprove && record.status === 'CALCULATED' && (
                  <Button size="small" type="primary" icon={<CheckOutlined />} loading={approveMutation.isPending} onClick={() => approveMutation.mutate(record.id)}>
                    Tasdiqlash
                  </Button>
                )}
                {canApprove && record.status === 'APPROVED' && (
                  <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => setPayModalPayrollId(record.id)}>
                    To'lash
                  </Button>
                )}
                {canApprove && ['DRAFT', 'CALCULATED', 'APPROVED'].includes(record.status) && (
                  <Popconfirm title="Bekor qilinsinmi?" onConfirm={() => cancelMutation.mutate(record.id)}>
                    <Button size="small" danger icon={<StopOutlined />}>
                      Bekor qilish
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <PayModal open={!!payModalPayrollId} onClose={() => setPayModalPayrollId(null)} payrollId={payModalPayrollId} />
    </div>
  );
}
