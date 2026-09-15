import { DollarOutlined, EyeOutlined, FilePdfOutlined, SearchOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Descriptions, Drawer, Input, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { getInvoice, listInvoices, openInvoicePdf, voidInvoice } from '../../api/invoices';
import { LegacyModuleNotice } from '../../components/LegacyModuleNotice';
import { RecordPaymentModal } from '../../components/RecordPaymentModal';
import { useAuthStore } from '../../store/auth.store';
import type { Invoice, InvoiceStatus } from '../../types';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: 'default',
  SENT: 'blue',
  PARTIALLY_PAID: 'orange',
  PAID: 'green',
  OVERDUE: 'red',
  VOID: 'default',
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Qoralama',
  SENT: 'Yuborilgan',
  PARTIALLY_PAID: 'Qisman to‘langan',
  PAID: "To'langan",
  OVERDUE: 'Muddati o‘tgan',
  VOID: 'Bekor qilingan',
};

export function InvoicesPage() {
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | undefined>();
  const [page, setPage] = useState(1);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const invoicesQuery = useQuery({
    queryKey: ['invoices', { search, status, page }],
    queryFn: () => listInvoices({ search: search || undefined, status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  const detailQuery = useQuery({ queryKey: ['invoice', viewingId], queryFn: () => getInvoice(viewingId!), enabled: !!viewingId });

  const voidMutation = useMutation({
    mutationFn: voidInvoice,
    onSuccess: () => {
      message.success('Hisob-faktura bekor qilindi');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', viewingId] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Bekor qilib bo‘lmadi');
    },
  });

  const canApprove = hasPermission('invoices', 'APPROVE');
  const canRecordPayment = hasPermission('payments', 'CREATE');
  const invoice = detailQuery.data;
  const remaining = invoice ? Number(invoice.grandTotal) - Number(invoice.amountPaid) : 0;

  return (
    <div>
      <LegacyModuleNotice />
      <Typography.Title level={4}>Hisob-fakturalar</Typography.Title>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Qidirish: hisob-faktura raqami"
          prefix={<SearchOutlined />}
          style={{ width: 240 }}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 200 }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </Space>

      <Table<Invoice>
        rowKey="id"
        loading={invoicesQuery.isLoading}
        dataSource={invoicesQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: invoicesQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Raqam', dataIndex: 'invoiceNumber' },
          { title: 'Mijoz', render: (_, record) => record.customer.companyName ?? record.customer.name },
          { title: 'Chiqarilgan', dataIndex: 'issueDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
          { title: 'Muddati', dataIndex: 'dueDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
          { title: 'Jami', dataIndex: 'grandTotal', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          { title: "To'langan", dataIndex: 'amountPaid', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          {
            title: 'Qolgan',
            render: (_, record) => (Number(record.grandTotal) - Number(record.amountPaid)).toLocaleString('uz-UZ'),
          },
          { title: 'Status', dataIndex: 'status', render: (v: InvoiceStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          {
            title: 'Amallar',
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<EyeOutlined />} onClick={() => setViewingId(record.id)} />
                <Button size="small" icon={<FilePdfOutlined />} onClick={() => openInvoicePdf(record.id, record.invoiceNumber)} />
              </Space>
            ),
          },
        ]}
      />

      <Drawer title={invoice?.invoiceNumber} open={!!viewingId} onClose={() => setViewingId(null)} size={520}>
        {invoice && (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Mijoz">{invoice.customer.companyName ?? invoice.customer.name}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_COLORS[invoice.status]}>{STATUS_LABELS[invoice.status]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Chiqarilgan">{new Date(invoice.issueDate).toLocaleDateString('uz-UZ')}</Descriptions.Item>
              <Descriptions.Item label="Muddati">{new Date(invoice.dueDate).toLocaleDateString('uz-UZ')}</Descriptions.Item>
              <Descriptions.Item label="Jami">{Number(invoice.grandTotal).toLocaleString('uz-UZ')}</Descriptions.Item>
              <Descriptions.Item label="To'langan">{Number(invoice.amountPaid).toLocaleString('uz-UZ')}</Descriptions.Item>
              <Descriptions.Item label="Qolgan">{remaining.toLocaleString('uz-UZ')}</Descriptions.Item>
            </Descriptions>

            <Table
              style={{ marginTop: 16 }}
              size="small"
              rowKey="id"
              dataSource={invoice.items}
              pagination={false}
              columns={[
                { title: 'Nomi', dataIndex: 'description' },
                { title: 'Miqdor', dataIndex: 'quantity' },
                { title: 'Narx', dataIndex: 'unitPrice' },
                { title: 'Jami', dataIndex: 'lineTotal' },
              ]}
            />

            <Space style={{ marginTop: 24 }} wrap>
              <Button icon={<FilePdfOutlined />} onClick={() => openInvoicePdf(invoice.id, invoice.invoiceNumber)}>
                PDF yuklab olish
              </Button>
              {remaining > 0 && canRecordPayment && !['VOID'].includes(invoice.status) && (
                <Button type="primary" icon={<DollarOutlined />} onClick={() => setPaymentModalOpen(true)}>
                  To'lov qabul qilish
                </Button>
              )}
              {canApprove && invoice.status !== 'VOID' && Number(invoice.amountPaid) === 0 && (
                <Popconfirm title="Hisob-fakturani bekor qilish?" onConfirm={() => voidMutation.mutate(invoice.id)}>
                  <Button loading={voidMutation.isPending} danger icon={<StopOutlined />}>
                    Bekor qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </div>
        )}
      </Drawer>

      {invoice && (
        <RecordPaymentModal
          open={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          referenceType="INVOICE"
          referenceId={invoice.id}
          remaining={remaining}
        />
      )}
    </div>
  );
}
