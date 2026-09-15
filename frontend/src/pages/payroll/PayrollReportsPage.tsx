import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { App, Button, Card, Col, Row, Select, Space, Statistic, Table, Tabs, Typography } from 'antd';
import { useState } from 'react';
import { listDepartments } from '../../api/departments';
import { downloadPayrollReport, getPayrollReport, listPayrollPeriods } from '../../api/payroll';
import { PageErrorState } from '../../components/PageErrorState';
import { formatNumber } from '../../utils/format';
import { palette } from '../../theme';

const money = (value: number) => formatNumber(value, 2);

export function PayrollReportsPage() {
  const { message } = App.useApp();
  const [periodId, setPeriodId] = useState<string | undefined>();
  const [departmentId, setDepartmentId] = useState<string | undefined>();

  const periodsQuery = useQuery({ queryKey: ['payroll-periods', { pageSize: 100 }], queryFn: () => listPayrollPeriods({ pageSize: 100 }) });
  const departmentsQuery = useQuery({ queryKey: ['departments', { pageSize: 100 }], queryFn: () => listDepartments({ pageSize: 100 }) });

  const filters = { periodId, departmentId };
  const summaryQuery = useQuery({ queryKey: ['payroll-reports', 'summary', filters], queryFn: () => getPayrollReport({ type: 'summary', ...filters }) });
  const byEmployeeQuery = useQuery({ queryKey: ['payroll-reports', 'by-employee', filters], queryFn: () => getPayrollReport({ type: 'by-employee', ...filters }) });
  const byDepartmentQuery = useQuery({ queryKey: ['payroll-reports', 'by-department', filters], queryFn: () => getPayrollReport({ type: 'by-department', ...filters }) });
  const overtimeQuery = useQuery({ queryKey: ['payroll-reports', 'overtime', filters], queryFn: () => getPayrollReport({ type: 'overtime', ...filters }) });
  const allowancesQuery = useQuery({ queryKey: ['payroll-reports', 'allowances', filters], queryFn: () => getPayrollReport({ type: 'allowances', ...filters }) });
  const deductionsQuery = useQuery({ queryKey: ['payroll-reports', 'deductions', filters], queryFn: () => getPayrollReport({ type: 'deductions', ...filters }) });

  async function handleExport(type: Parameters<typeof downloadPayrollReport>[0]['type']) {
    try {
      await downloadPayrollReport({ type, ...filters });
    } catch {
      message.error('Eksport qilib bo‘lmadi');
    }
  }

  const summary = summaryQuery.data as
    | { employeeCount: number; totalGross: number; totalDeduction: number; totalNet: number; totalOvertime: number; totalBonus: number; totalAllowance: number }
    | undefined;

  if (summaryQuery.isError && !summaryQuery.data) {
    return <PageErrorState onRetry={() => summaryQuery.refetch()} />;
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Ish haqi hisobotlari
        </Typography.Title>
        <Space>
          <Select
            placeholder="Davr"
            allowClear
            style={{ width: 200 }}
            options={periodsQuery.data?.items.map((p) => ({ value: p.id, label: p.name }))}
            onChange={setPeriodId}
          />
          <Select
            placeholder="Bo'lim"
            allowClear
            style={{ width: 200 }}
            options={departmentsQuery.data?.items.map((d) => ({ value: d.id, label: d.name }))}
            onChange={setDepartmentId}
          />
        </Space>
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic title="Xodimlar" value={summary?.employeeCount ?? 0} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title="Jami (Gross)" value={summary?.totalGross ?? 0} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title="Ushlab qolinganlar" value={summary?.totalDeduction ?? 0} styles={{ content: { color: palette.error } }} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title="Sof (Net)" value={summary?.totalNet ?? 0} styles={{ content: { color: palette.success } }} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title="Qo'shimcha ish" value={summary?.totalOvertime ?? 0} />
          </Card>
        </Col>
      </Row>

      <Tabs
        items={[
          {
            key: 'by-employee',
            label: 'Xodimlar bo\'yicha',
            children: (
              <>
                <Button icon={<DownloadOutlined />} style={{ marginBottom: 12 }} onClick={() => handleExport('by-employee')}>
                  CSV
                </Button>
                <Table
                  rowKey="payrollNumber"
                  size="small"
                  loading={byEmployeeQuery.isLoading}
                  dataSource={byEmployeeQuery.data as never[]}
                  pagination={{ pageSize: 20 }}
                  columns={[
                    { title: 'Raqam', dataIndex: 'payrollNumber' },
                    { title: 'Xodim', dataIndex: 'employee' },
                    { title: "Bo'lim", dataIndex: 'department' },
                    { title: 'Asosiy', dataIndex: 'base', align: 'right', render: money },
                    { title: "Qo'shimcha ish", dataIndex: 'overtime', align: 'right', render: money },
                    { title: 'Bonus', dataIndex: 'bonus', align: 'right', render: money },
                    { title: 'Ushlab qolish', dataIndex: 'deduction', align: 'right', render: money },
                    { title: 'Jami', dataIndex: 'gross', align: 'right', render: money },
                    { title: 'Sof', dataIndex: 'net', align: 'right', render: money },
                    { title: 'Status', dataIndex: 'status' },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'by-department',
            label: "Bo'limlar bo'yicha",
            children: (
              <>
                <Button icon={<DownloadOutlined />} style={{ marginBottom: 12 }} onClick={() => handleExport('by-department')}>
                  CSV
                </Button>
                <Table
                  rowKey="department"
                  size="small"
                  loading={byDepartmentQuery.isLoading}
                  dataSource={byDepartmentQuery.data as never[]}
                  pagination={false}
                  columns={[
                    { title: "Bo'lim", dataIndex: 'department' },
                    { title: 'Xodimlar', dataIndex: 'employeeCount' },
                    { title: 'Jami', dataIndex: 'gross', align: 'right', render: money },
                    { title: 'Ushlab qolish', dataIndex: 'deduction', align: 'right', render: money },
                    { title: 'Sof', dataIndex: 'net', align: 'right', render: money },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'overtime',
            label: "Qo'shimcha ish",
            children: (
              <>
                <Button icon={<DownloadOutlined />} style={{ marginBottom: 12 }} onClick={() => handleExport('overtime')}>
                  CSV
                </Button>
                <Table
                  rowKey="payrollNumber"
                  size="small"
                  loading={overtimeQuery.isLoading}
                  dataSource={overtimeQuery.data as never[]}
                  pagination={{ pageSize: 20 }}
                  columns={[
                    { title: 'Raqam', dataIndex: 'payrollNumber' },
                    { title: 'Xodim', dataIndex: 'employee' },
                    { title: 'Daqiqa', dataIndex: 'overtimeMinutes' },
                    { title: 'Summa', dataIndex: 'overtimeAmount', align: 'right', render: money },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'allowances',
            label: "Qo'shimcha to'lovlar",
            children: (
              <>
                <Button icon={<DownloadOutlined />} style={{ marginBottom: 12 }} onClick={() => handleExport('allowances')}>
                  CSV
                </Button>
                <Table
                  rowKey={(r: never) => JSON.stringify(r)}
                  size="small"
                  loading={allowancesQuery.isLoading}
                  dataSource={allowancesQuery.data as never[]}
                  pagination={{ pageSize: 20 }}
                  columns={[
                    { title: 'Raqam', dataIndex: 'payrollNumber' },
                    { title: 'Xodim', dataIndex: 'employee' },
                    { title: 'Turi', dataIndex: 'component' },
                    { title: 'Summa', dataIndex: 'amount', align: 'right', render: money },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'deductions',
            label: 'Ushlab qolishlar',
            children: (
              <>
                <Button icon={<DownloadOutlined />} style={{ marginBottom: 12 }} onClick={() => handleExport('deductions')}>
                  CSV
                </Button>
                <Table
                  rowKey={(r: never) => JSON.stringify(r)}
                  size="small"
                  loading={deductionsQuery.isLoading}
                  dataSource={deductionsQuery.data as never[]}
                  pagination={{ pageSize: 20 }}
                  columns={[
                    { title: 'Raqam', dataIndex: 'payrollNumber' },
                    { title: 'Xodim', dataIndex: 'employee' },
                    { title: 'Turi', dataIndex: 'component' },
                    { title: 'Summa', dataIndex: 'amount', align: 'right', render: money },
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
