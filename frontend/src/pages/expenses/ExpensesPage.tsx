import { CheckOutlined, CloseOutlined, DollarOutlined, PlusOutlined, SendOutlined, StopOutlined, TagsOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { approveExpense, cancelExpense, listExpenses, payExpense, rejectExpense, submitExpense } from '../../api/expenses';
import { CreateExpenseModal } from '../../components/CreateExpenseModal';
import { ExpenseCategoriesDrawer } from '../../components/ExpenseCategoriesDrawer';
import { useAuthStore } from '../../store/auth.store';
import type { Expense, ExpenseStatus } from '../../types';

const STATUS_COLORS: Record<ExpenseStatus, string> = {
  DRAFT: 'default',
  PENDING: 'gold',
  APPROVED: 'blue',
  PAID: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
};

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  DRAFT: 'Qoralama',
  PENDING: 'Kutilmoqda',
  APPROVED: 'Tasdiqlangan',
  PAID: "To'langan",
  REJECTED: 'Rad etilgan',
  CANCELLED: 'Bekor qilingan',
};

export function ExpensesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [status, setStatus] = useState<ExpenseStatus | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const expensesQuery = useQuery({
    queryKey: ['expenses', { status, page }],
    queryFn: () => listExpenses({ status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  }

  function useWorkflowMutation(fn: (id: string) => Promise<Expense>, successMessage: string) {
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

  const submitMutation = useWorkflowMutation(submitExpense, 'Tasdiqlashga yuborildi');
  const approveMutation = useWorkflowMutation(approveExpense, 'Xarajat tasdiqlandi');
  const rejectMutation = useWorkflowMutation(rejectExpense, 'Xarajat rad etildi');
  const payMutation = useWorkflowMutation(payExpense, "Xarajat to'landi");
  const cancelMutation = useWorkflowMutation(cancelExpense, 'Xarajat bekor qilindi');

  const canEdit = hasPermission('expenses', 'EDIT');
  const canApprove = hasPermission('expenses', 'APPROVE');

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Xarajatlar
        </Typography.Title>
        <Space>
          <Button icon={<TagsOutlined />} onClick={() => setCategoriesOpen(true)}>
            Kategoriyalar
          </Button>
          {hasPermission('expenses', 'CREATE') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Yangi xarajat
            </Button>
          )}
        </Space>
      </Space>

      <Space style={{ marginBottom: 16 }}>
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

      <Table<Expense>
        rowKey="id"
        loading={expensesQuery.isLoading}
        dataSource={expensesQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: expensesQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Raqam', dataIndex: 'expenseNumber' },
          { title: 'Kategoriya', dataIndex: ['category', 'name'] },
          { title: 'Summa', dataIndex: 'amount', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          { title: 'Sana', dataIndex: 'expenseDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
          { title: 'Status', dataIndex: 'status', render: (v: ExpenseStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          { title: 'Kim yaratdi', dataIndex: ['createdBy', 'fullName'] },
          {
            title: 'Amallar',
            render: (_, record) => (
              <Space>
                {canEdit && record.status === 'DRAFT' && (
                  <Button size="small" icon={<SendOutlined />} loading={submitMutation.isPending} onClick={() => submitMutation.mutate(record.id)}>
                    Yuborish
                  </Button>
                )}
                {canApprove && record.status === 'PENDING' && (
                  <>
                    <Button
                      size="small"
                      type="primary"
                      icon={<CheckOutlined />}
                      loading={approveMutation.isPending}
                      onClick={() => approveMutation.mutate(record.id)}
                    >
                      Tasdiqlash
                    </Button>
                    <Popconfirm title="Xarajatni rad etish?" onConfirm={() => rejectMutation.mutate(record.id)}>
                      <Button loading={rejectMutation.isPending} size="small" danger icon={<CloseOutlined />}>
                        Rad etish
                      </Button>
                    </Popconfirm>
                  </>
                )}
                {canApprove && record.status === 'APPROVED' && (
                  <Popconfirm title="To'lovni amalga oshirish?" onConfirm={() => payMutation.mutate(record.id)}>
                    <Button loading={payMutation.isPending} size="small" type="primary" icon={<DollarOutlined />}>
                      To'lash
                    </Button>
                  </Popconfirm>
                )}
                {canEdit && ['DRAFT', 'PENDING', 'APPROVED'].includes(record.status) && (
                  <Popconfirm title="Xarajatni bekor qilish?" onConfirm={() => cancelMutation.mutate(record.id)}>
                    <Button loading={cancelMutation.isPending} size="small" icon={<StopOutlined />}>
                      Bekor qilish
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <CreateExpenseModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <ExpenseCategoriesDrawer open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
    </div>
  );
}
