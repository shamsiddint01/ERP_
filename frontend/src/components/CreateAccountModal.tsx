import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, InputNumber, Modal, Select, Switch } from 'antd';
import { createAccount, listAccounts } from '../api/accounts';
import type { AccountCategory, AccountType } from '../types';

interface CreateAccountModalProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  code: string;
  name: string;
  type: AccountType;
  category: AccountCategory;
  parentId?: string;
  description?: string;
  isPostable?: boolean;
  openingBalance?: number;
}

const CATEGORY_OPTIONS: Array<{ label: string; value: AccountCategory }> = [
  { label: 'Aktiv (Asset)', value: 'ASSET' },
  { label: 'Majburiyat (Liability)', value: 'LIABILITY' },
  { label: 'Kapital (Equity)', value: 'EQUITY' },
  { label: 'Daromad (Revenue)', value: 'REVENUE' },
  { label: 'Xarajat (Expense)', value: 'EXPENSE' },
];

const TYPE_OPTIONS: Array<{ label: string; value: AccountType }> = [
  { label: 'Kassa (Cash)', value: 'CASH' },
  { label: 'Bank', value: 'BANK' },
  { label: 'Debitorlik (Receivable)', value: 'RECEIVABLE' },
  { label: 'Kreditorlik (Payable)', value: 'PAYABLE' },
  { label: 'Daromad (Revenue)', value: 'REVENUE' },
  { label: 'Xarajat (Expense)', value: 'EXPENSE' },
  { label: 'Kapital (Equity)', value: 'EQUITY' },
  { label: 'Ombor (Inventory)', value: 'INVENTORY' },
];

export function CreateAccountModal({ open, onClose }: CreateAccountModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const parentOptionsQuery = useQuery({
    queryKey: ['accounts', { pageSize: 100 }],
    queryFn: () => listAccounts({ pageSize: 100 }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      message.success('Hisob yaratildi');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Hisobni saqlab bo‘lmadi');
    },
  });

  return (
    <Modal title="Yangi hisob (Chart of Accounts)" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)} initialValues={{ isPostable: true }}>
        <Form.Item name="code" label="Kod" rules={[{ required: true, pattern: /^[0-9]{3,10}$/, message: '3-10 xonali raqam' }]}>
          <Input placeholder="Masalan: 1150" />
        </Form.Item>
        <Form.Item name="name" label="Nomi" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="type" label="Turi" rules={[{ required: true }]}>
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item name="category" label="Toifa (fundamental category)" rules={[{ required: true }]}>
          <Select options={CATEGORY_OPTIONS} />
        </Form.Item>
        <Form.Item name="parentId" label="Ota-hisob (ixtiyoriy)">
          <Select
            allowClear
            loading={parentOptionsQuery.isLoading}
            options={parentOptionsQuery.data?.items.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
          />
        </Form.Item>
        <Form.Item name="openingBalance" label="Boshlang'ich qoldiq">
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="Izoh">
          <Input.TextArea />
        </Form.Item>
        <Form.Item name="isPostable" label="Yozuv qabul qiladi (leaf account)" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
