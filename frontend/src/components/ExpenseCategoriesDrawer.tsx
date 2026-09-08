import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Empty, Form, Input, List, Select } from 'antd';
import { listAccounts } from '../api/accounts';
import { createExpenseCategory, listExpenseCategories } from '../api/expenses';

interface ExpenseCategoriesDrawerProps {
  open: boolean;
  onClose: () => void;
}

/** Reusable Expense Category CRUD surface — each category maps to a Chart of Accounts expense leaf. */
export function ExpenseCategoriesDrawer({ open, onClose }: ExpenseCategoriesDrawerProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const categoriesQuery = useQuery({ queryKey: ['expense-categories'], queryFn: listExpenseCategories, enabled: open });
  const accountsQuery = useQuery({
    queryKey: ['accounts', { category: 'EXPENSE' }],
    queryFn: () => listAccounts({ category: 'EXPENSE', pageSize: 100 }),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: createExpenseCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      form.resetFields();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Kategoriya yaratib bo‘lmadi');
    },
  });

  return (
    <Drawer title="Xarajat kategoriyalari" open={open} onClose={onClose} size={420}>
      <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)} style={{ marginBottom: 16 }}>
        <Form.Item name="name" label="Yangi kategoriya nomi" rules={[{ required: true, message: 'Nomi kerak' }]}>
          <Input placeholder="Masalan: Ijara" />
        </Form.Item>
        <Form.Item name="accountId" label="Bog'langan hisob (Chart of Accounts)">
          <Select
            allowClear
            loading={accountsQuery.isLoading}
            options={accountsQuery.data?.items.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
            placeholder="Hisobni tanlang"
          />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={createMutation.isPending}>
          Qo'shish
        </Button>
      </Form>

      <List
        loading={categoriesQuery.isLoading}
        dataSource={categoriesQuery.data}
        locale={{ emptyText: <Empty description="Kategoriyalar yo'q" /> }}
        renderItem={(category) => (
          <List.Item>
            <div>
              <div>{category.name}</div>
              <div style={{ color: '#999', fontSize: 12 }}>
                {category.account ? `${category.account.code} — ${category.account.name}` : 'Hisob bog\'lanmagan'} ·{' '}
                {category._count?.expenses ?? 0} ta xarajat
              </div>
            </div>
          </List.Item>
        )}
      />
    </Drawer>
  );
}
