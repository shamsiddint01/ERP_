import { BarChartOutlined, PlusOutlined, TagsOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPayrollPeriods } from '../../api/payroll';
import { CreatePayrollPeriodModal } from '../../components/CreatePayrollPeriodModal';
import { PageErrorState } from '../../components/PageErrorState';
import { PayrollComponentsDrawer } from '../../components/PayrollComponentsDrawer';
import { useAuthStore } from '../../store/auth.store';
import type { PayrollPeriod, PayrollPeriodStatus } from '../../types';

const STATUS_COLORS: Record<PayrollPeriodStatus, string> = { OPEN: 'green', CLOSED: 'default' };
const STATUS_LABELS: Record<PayrollPeriodStatus, string> = { OPEN: 'Ochiq', CLOSED: 'Yopiq' };

export function PayrollPeriodsPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [componentsOpen, setComponentsOpen] = useState(false);

  const periodsQuery = useQuery({
    queryKey: ['payroll-periods', { page }],
    queryFn: () => listPayrollPeriods({ page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  if (periodsQuery.isError && !periodsQuery.data) {
    return <PageErrorState onRetry={() => periodsQuery.refetch()} />;
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Ish haqi (Payroll)
        </Typography.Title>
        <Space>
          <Button icon={<BarChartOutlined />} onClick={() => navigate('/payroll/reports')}>
            Hisobotlar
          </Button>
          <Button icon={<TagsOutlined />} onClick={() => setComponentsOpen(true)}>
            Bonus/Ushlab qolish turlari
          </Button>
          {hasPermission('payroll', 'CREATE') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Yangi davr
            </Button>
          )}
        </Space>
      </Space>

      <Table<PayrollPeriod>
        rowKey="id"
        loading={periodsQuery.isLoading}
        dataSource={periodsQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/payroll/periods/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: periodsQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Nomi', dataIndex: 'name' },
          { title: 'Boshlanishi', dataIndex: 'periodStart', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
          { title: 'Tugashi', dataIndex: 'periodEnd', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
          { title: "Ish haqi yozuvlari", render: (_, record) => record._count?.payrolls ?? 0 },
          { title: 'Status', dataIndex: 'status', render: (v: PayrollPeriodStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
        ]}
      />

      <CreatePayrollPeriodModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <PayrollComponentsDrawer open={componentsOpen} onClose={() => setComponentsOpen(false)} />
    </div>
  );
}
