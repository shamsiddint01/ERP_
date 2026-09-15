import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Row, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  downloadReportExport,
  getApReconciliation,
  getArReconciliation,
  getBalanceSheet,
  getCashFlow,
  getGeneralLedger,
  getProfitAndLoss,
  getTrialBalance,
} from '../../api/reports';
import { PageErrorState } from '../../components/PageErrorState';
import { formatNumber } from '../../utils/format';

const { RangePicker } = DatePicker;

const money = (value: number) => formatNumber(value, 2);

export function ReportsPage() {
  const { message } = App.useApp();
  const [range, setRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>([dayjs().startOf('month'), dayjs()]);

  const from = range?.[0]?.format('YYYY-MM-DD');
  const to = range?.[1]?.format('YYYY-MM-DD');

  const trialBalanceQuery = useQuery({ queryKey: ['reports', 'trial-balance', to], queryFn: () => getTrialBalance({ to }) });
  const profitAndLossQuery = useQuery({ queryKey: ['reports', 'profit-and-loss', from, to], queryFn: () => getProfitAndLoss({ from, to }) });
  const balanceSheetQuery = useQuery({ queryKey: ['reports', 'balance-sheet', to], queryFn: () => getBalanceSheet({ to }) });
  const cashFlowQuery = useQuery({ queryKey: ['reports', 'cash-flow', from, to], queryFn: () => getCashFlow({ from, to }) });
  const generalLedgerQuery = useQuery({ queryKey: ['reports', 'general-ledger', from, to], queryFn: () => getGeneralLedger({ from, to }) });
  const arReconciliationQuery = useQuery({ queryKey: ['reports', 'ar-reconciliation'], queryFn: getArReconciliation });
  const apReconciliationQuery = useQuery({ queryKey: ['reports', 'ap-reconciliation'], queryFn: getApReconciliation });

  async function handleExport(reportPath: string, format: 'csv' | 'pdf') {
    try {
      await downloadReportExport(reportPath, format, { from, to }, reportPath);
    } catch {
      message.error('Eksport qilib bo‘lmadi');
    }
  }

  if (trialBalanceQuery.isError && !trialBalanceQuery.data) {
    return <PageErrorState onRetry={() => trialBalanceQuery.refetch()} />;
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Moliyaviy hisobotlar
        </Typography.Title>
        <RangePicker value={range} onChange={(value) => setRange(value)} />
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small">
            <Statistic
              title="Debitorlik (AR) muvofiqlashtirish"
              value={arReconciliationQuery.data?.controlBalance ?? 0}
              precision={2}
              suffix={
                arReconciliationQuery.data && (
                  <Tag color={arReconciliationQuery.data.variance === 0 ? 'green' : 'red'} style={{ marginLeft: 8 }}>
                    Farq: {money(arReconciliationQuery.data.variance)}
                  </Tag>
                )
              }
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small">
            <Statistic
              title="Kreditorlik (AP) muvofiqlashtirish"
              value={apReconciliationQuery.data?.controlBalance ?? 0}
              precision={2}
              suffix={
                apReconciliationQuery.data && (
                  <Tag color={apReconciliationQuery.data.variance === 0 ? 'green' : 'red'} style={{ marginLeft: 8 }}>
                    Farq: {money(apReconciliationQuery.data.variance)}
                  </Tag>
                )
              }
            />
          </Card>
        </Col>
      </Row>

      <Tabs
        items={[
          {
            key: 'trial-balance',
            label: 'Aylanma qoldiq (Trial Balance)',
            children: (
              <>
                <Space style={{ marginBottom: 12 }}>
                  <Button icon={<DownloadOutlined />} onClick={() => handleExport('trial-balance', 'csv')}>
                    CSV
                  </Button>
                  <Button icon={<DownloadOutlined />} onClick={() => handleExport('trial-balance', 'pdf')}>
                    PDF
                  </Button>
                  {trialBalanceQuery.data && (
                    <Tag color={trialBalanceQuery.data.isBalanced ? 'green' : 'red'}>
                      {trialBalanceQuery.data.isBalanced ? 'Balanslashgan' : 'Balanslashmagan!'}
                    </Tag>
                  )}
                </Space>
                <Table
                  rowKey="accountId"
                  loading={trialBalanceQuery.isLoading}
                  dataSource={trialBalanceQuery.data?.rows}
                  pagination={false}
                  columns={[
                    { title: 'Kod', dataIndex: 'code', width: 80 },
                    { title: 'Hisob', dataIndex: 'name' },
                    { title: 'Debit', dataIndex: 'debit', align: 'right', render: (v: number) => (v ? money(v) : '') },
                    { title: 'Kredit', dataIndex: 'credit', align: 'right', render: (v: number) => (v ? money(v) : '') },
                  ]}
                  summary={() => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={2}>
                        <b>Jami</b>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <b>{money(trialBalanceQuery.data?.totalDebit ?? 0)}</b>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">
                        <b>{money(trialBalanceQuery.data?.totalCredit ?? 0)}</b>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                />
              </>
            ),
          },
          {
            key: 'profit-and-loss',
            label: 'Foyda va zarar (P&L)',
            children: (
              <>
                <Space style={{ marginBottom: 12 }}>
                  <Button icon={<DownloadOutlined />} onClick={() => handleExport('profit-and-loss', 'csv')}>
                    CSV
                  </Button>
                  <Button icon={<DownloadOutlined />} onClick={() => handleExport('profit-and-loss', 'pdf')}>
                    PDF
                  </Button>
                </Space>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={8}>
                    <Statistic title="Jami daromad" value={profitAndLossQuery.data?.totalRevenue ?? 0} precision={2} />
                  </Col>
                  <Col span={8}>
                    <Statistic title="Jami xarajat" value={profitAndLossQuery.data?.totalExpense ?? 0} precision={2} />
                  </Col>
                  <Col span={8}>
                    <Statistic title="Sof foyda" value={profitAndLossQuery.data?.netIncome ?? 0} precision={2} />
                  </Col>
                </Row>
                <Typography.Text strong>Daromadlar</Typography.Text>
                <Table
                  rowKey="accountId"
                  size="small"
                  loading={profitAndLossQuery.isLoading}
                  dataSource={profitAndLossQuery.data?.revenueLines}
                  pagination={false}
                  style={{ marginBottom: 16 }}
                  columns={[
                    { title: 'Kod', dataIndex: 'code', width: 80 },
                    { title: 'Hisob', dataIndex: 'name' },
                    { title: 'Summa', dataIndex: 'amount', align: 'right', render: money },
                  ]}
                />
                <Typography.Text strong>Xarajatlar</Typography.Text>
                <Table
                  rowKey="accountId"
                  size="small"
                  loading={profitAndLossQuery.isLoading}
                  dataSource={profitAndLossQuery.data?.expenseLines}
                  pagination={false}
                  columns={[
                    { title: 'Kod', dataIndex: 'code', width: 80 },
                    { title: 'Hisob', dataIndex: 'name' },
                    { title: 'Summa', dataIndex: 'amount', align: 'right', render: money },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'balance-sheet',
            label: 'Balans (Balance Sheet)',
            children: (
              <>
                <Space style={{ marginBottom: 12 }}>
                  <Button icon={<DownloadOutlined />} onClick={() => handleExport('balance-sheet', 'csv')}>
                    CSV
                  </Button>
                  {balanceSheetQuery.data && (
                    <Tag color={balanceSheetQuery.data.isBalanced ? 'green' : 'red'}>
                      {balanceSheetQuery.data.isBalanced ? 'Balanslashgan' : 'Balanslashmagan!'}
                    </Tag>
                  )}
                </Space>
                <Row gutter={16}>
                  <Col span={8}>
                    <Typography.Text strong>Aktivlar (jami: {money(balanceSheetQuery.data?.totalAssets ?? 0)})</Typography.Text>
                    <Table
                      rowKey={(r) => r.accountId ?? r.name}
                      size="small"
                      loading={balanceSheetQuery.isLoading}
                      dataSource={balanceSheetQuery.data?.assetLines}
                      pagination={false}
                      showHeader={false}
                      columns={[{ dataIndex: 'name' }, { dataIndex: 'amount', align: 'right', render: money }]}
                    />
                  </Col>
                  <Col span={8}>
                    <Typography.Text strong>Majburiyatlar (jami: {money(balanceSheetQuery.data?.totalLiabilities ?? 0)})</Typography.Text>
                    <Table
                      rowKey={(r) => r.accountId ?? r.name}
                      size="small"
                      loading={balanceSheetQuery.isLoading}
                      dataSource={balanceSheetQuery.data?.liabilityLines}
                      pagination={false}
                      showHeader={false}
                      columns={[{ dataIndex: 'name' }, { dataIndex: 'amount', align: 'right', render: money }]}
                    />
                  </Col>
                  <Col span={8}>
                    <Typography.Text strong>Kapital (jami: {money(balanceSheetQuery.data?.totalEquity ?? 0)})</Typography.Text>
                    <Table
                      rowKey={(r) => r.accountId ?? r.name}
                      size="small"
                      loading={balanceSheetQuery.isLoading}
                      dataSource={balanceSheetQuery.data?.equityLines}
                      pagination={false}
                      showHeader={false}
                      columns={[{ dataIndex: 'name' }, { dataIndex: 'amount', align: 'right', render: money }]}
                    />
                  </Col>
                </Row>
              </>
            ),
          },
          {
            key: 'cash-flow',
            label: 'Pul oqimi (Cash Flow)',
            children: (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={6}>
                    <Statistic title="Boshlang'ich qoldiq" value={cashFlowQuery.data?.openingBalance ?? 0} precision={2} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="Kirim" value={cashFlowQuery.data?.inflows ?? 0} precision={2} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="Chiqim" value={cashFlowQuery.data?.outflows ?? 0} precision={2} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="Yakuniy qoldiq" value={cashFlowQuery.data?.closingBalance ?? 0} precision={2} />
                  </Col>
                </Row>
                <Table
                  rowKey={(r) => `${r.entryNumber}-${r.account.id}`}
                  size="small"
                  loading={cashFlowQuery.isLoading}
                  dataSource={cashFlowQuery.data?.entries}
                  pagination={{ pageSize: 20 }}
                  columns={[
                    { title: 'Hujjat', dataIndex: 'entryNumber' },
                    { title: 'Sana', dataIndex: 'entryDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
                    { title: 'Izoh', dataIndex: 'description' },
                    { title: 'Hisob', dataIndex: ['account', 'name'] },
                    { title: 'Kirim', dataIndex: 'debit', align: 'right', render: (v: number) => (v ? money(v) : '') },
                    { title: 'Chiqim', dataIndex: 'credit', align: 'right', render: (v: number) => (v ? money(v) : '') },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'general-ledger',
            label: 'Bosh kitob (General Ledger)',
            children: (
              <>
                <Space style={{ marginBottom: 12 }}>
                  <Button icon={<DownloadOutlined />} onClick={() => handleExport('general-ledger', 'csv')}>
                    CSV
                  </Button>
                </Space>
                <Table
                  rowKey={(r) => `${r.entryNumber}-${r.account.id}`}
                  size="small"
                  loading={generalLedgerQuery.isLoading}
                  dataSource={generalLedgerQuery.data?.rows}
                  pagination={{ pageSize: 20 }}
                  columns={[
                    { title: 'Hujjat', dataIndex: 'entryNumber' },
                    { title: 'Sana', dataIndex: 'entryDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
                    { title: 'Hisob', render: (_, r) => `${r.account.code} — ${r.account.name}` },
                    { title: 'Izoh', dataIndex: 'description' },
                    { title: 'Debit', dataIndex: 'debit', align: 'right', render: (v: number) => (v ? money(v) : '') },
                    { title: 'Kredit', dataIndex: 'credit', align: 'right', render: (v: number) => (v ? money(v) : '') },
                    { title: 'Qoldiq', dataIndex: 'runningBalance', align: 'right', render: money },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
