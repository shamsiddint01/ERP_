import { CheckCircleOutlined, ExclamationCircleOutlined, FileTextOutlined, WalletOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Card, Skeleton, Table } from 'antd';
import { getPortalPayments } from '../../api/portal';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { palette } from '../../theme';
import { formatDate, formatDateTime, formatNumber } from '../../utils/format';
import { PaymentStateTag, StateTag } from '../../components/PaymentStateTag';
import { chargeState } from '../../utils/paymentState';
import { METHOD_LABELS } from './portalLabels';

const money = (value: number | string) => formatNumber(value);

export function PortalPaymentsPage() {
  const paymentsQuery = useQuery({ queryKey: ['portal', 'payments'], queryFn: getPortalPayments });

  if (paymentsQuery.isError) return <PageErrorState onRetry={() => paymentsQuery.refetch()} />;
  if (paymentsQuery.isLoading || !paymentsQuery.data) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  const { balance, charges, payments } = paymentsQuery.data;

  return (
    <div>
      <PageHeader title="To'lovlarim" subtitle="Hisoblangan to'lovlar, to'langanlari va qarzdorlik (so'mda)" />

      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard icon={<FileTextOutlined />} title="Jami hisoblangan" value={balance.totalBilled} formatter={money} color={palette.info} />
        <StatCard icon={<CheckCircleOutlined />} title="To'langan" value={balance.paid} formatter={money} color={palette.success} />
        <StatCard icon={<WalletOutlined />} title="Qarzdorlik" value={balance.outstanding} formatter={money} color={balance.outstanding > 0 ? palette.primary : palette.success} />
        <StatCard icon={<ExclamationCircleOutlined />} title="Muddati o'tgan" value={balance.overdue} formatter={money} color={balance.overdue > 0 ? palette.error : palette.success} />
      </div>

      <Card title="Hisoblangan to'lovlar" style={{ marginBottom: 20 }} styles={{ body: { paddingTop: 8 } }}>
        <Table
          rowKey="id"
          size="middle"
          dataSource={charges}
          pagination={charges.length > 10 ? { pageSize: 10 } : false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: "Hali to'lov hisoblanmagan" }}
          columns={[
            { title: 'Davr', dataIndex: 'billingPeriod' },
            { title: 'Guruh', render: (_, c) => c.group.name },
            { title: 'Summa', render: (_, c) => money(c.netAmount), align: 'right' },
            { title: "To'langan", render: (_, c) => money(c.allocatedAmount), align: 'right' },
            {
              title: 'Qoldiq',
              render: (_, c) => <span style={{ fontWeight: 700, color: c.outstanding > 0 ? palette.primary : undefined }}>{money(c.outstanding)}</span>,
              align: 'right',
            },
            { title: 'Muddat', render: (_, c) => formatDate(c.dueDate) },
            { title: 'Holat', render: (_, c) => <StateTag state={chargeState(c.status)} /> },
          ]}
        />
      </Card>

      <Card title="To'lovlar tarixi" styles={{ body: { paddingTop: 8 } }}>
        <Table
          rowKey="id"
          size="middle"
          dataSource={payments}
          pagination={payments.length > 10 ? { pageSize: 10 } : false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: "Hali to'lov qilinmagan" }}
          columns={[
            { title: 'Sana', render: (_, p) => formatDateTime(p.paidAt ?? p.createdAt) },
            { title: 'Raqam', dataIndex: 'paymentNumber' },
            { title: 'Usul', render: (_, p) => METHOD_LABELS[p.method] },
            { title: 'Summa', render: (_, p) => <span style={{ fontWeight: 700 }}>{money(p.amount)}</span>, align: 'right' },
            { title: 'Holat', render: (_, p) => <PaymentStateTag status={p.status} /> },
          ]}
        />
      </Card>
    </div>
  );
}
