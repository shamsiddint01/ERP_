import { PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { deactivateAccount, listAccounts } from '../../api/accounts';
import { CreateAccountModal } from '../../components/CreateAccountModal';
import { useAuthStore } from '../../store/auth.store';
import type { Account, AccountCategory } from '../../types';

const CATEGORY_COLORS: Record<AccountCategory, string> = {
  ASSET: 'blue',
  LIABILITY: 'volcano',
  EQUITY: 'purple',
  REVENUE: 'green',
  EXPENSE: 'gold',
};

const CATEGORY_LABELS: Record<AccountCategory, string> = {
  ASSET: 'Aktiv',
  LIABILITY: 'Majburiyat',
  EQUITY: 'Kapital',
  REVENUE: 'Daromad',
  EXPENSE: 'Xarajat',
};

export function AccountsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [category, setCategory] = useState<AccountCategory | undefined>();
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ['accounts', { category, showInactive }],
    queryFn: () => listAccounts({ category, isActive: showInactive ? undefined : true, pageSize: 100 }),
    placeholderData: (prev) => prev,
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateAccount,
    onSuccess: () => {
      message.success('Hisob faolsizlantirildi');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Faolsizlantirib bo‘lmadi');
    },
  });

  const canEdit = hasPermission('finance', 'EDIT');

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Hisoblar rejasi (Chart of Accounts)
        </Typography.Title>
        {hasPermission('finance', 'CREATE') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi hisob
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="Toifa"
          allowClear
          style={{ width: 200 }}
          options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={setCategory}
        />
        <Space>
          <Switch checked={showInactive} onChange={setShowInactive} />
          <span>Faolsizlarni ham ko'rsatish</span>
        </Space>
      </Space>

      <Table<Account>
        rowKey="id"
        loading={accountsQuery.isLoading}
        dataSource={accountsQuery.data?.items}
        pagination={false}
        columns={[
          { title: 'Kod', dataIndex: 'code', width: 90 },
          { title: 'Nomi', dataIndex: 'name' },
          { title: 'Toifa', dataIndex: 'category', render: (v: AccountCategory) => <Tag color={CATEGORY_COLORS[v]}>{CATEGORY_LABELS[v]}</Tag> },
          { title: 'Turi', dataIndex: 'type' },
          {
            title: 'Joriy qoldiq',
            dataIndex: 'currentBalance',
            align: 'right',
            render: (v: string) => Number(v).toLocaleString('uz-UZ'),
          },
          {
            title: '',
            dataIndex: 'isPostable',
            render: (v: boolean) => (v ? null : <Tag>Header</Tag>),
          },
          {
            title: 'Status',
            dataIndex: 'isActive',
            render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Faol' : 'Faolsiz'}</Tag>,
          },
          {
            title: 'Amallar',
            render: (_, record) =>
              canEdit &&
              record.isActive &&
              !record.isSystemAccount && (
                <Popconfirm title="Hisobni faolsizlantirish?" onConfirm={() => deactivateMutation.mutate(record.id)}>
                  <Button size="small" danger icon={<StopOutlined />}>
                    Faolsizlantirish
                  </Button>
                </Popconfirm>
              ),
          },
        ]}
      />

      <CreateAccountModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
