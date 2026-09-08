import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { createExpense, listExpenseCategories } from '../api/expenses';
import type { PaymentMethod } from '../types';

interface CreateExpenseModalProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  categoryId: string;
  amount: number;
  expenseDate: dayjs.Dayjs;
  description?: string;
  paymentMethod: PaymentMethod;
}

const METHOD_OPTIONS: Array<{ label: string; value: PaymentMethod }> = [
  { label: 'Naqd (Cash)', value: 'CASH' },
  { label: 'Karta (Card)', value: 'CARD' },
  { label: "O'tkazma (Bank transfer)", value: 'BANK_TRANSFER' },
  { label: 'Onlayn (Online)', value: 'ONLINE' },
  { label: 'Chek (Cheque)', value: 'CHEQUE' },
];

export function CreateExpenseModal({ open, onClose }: CreateExpenseModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const categoriesQuery = useQuery({ queryKey: ['expense-categories'], queryFn: listExpenseCategories, enabled: open });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createExpense({ ...values, expenseDate: values.expenseDate.format('YYYY-MM-DD') }),
    onSuccess: () => {
      message.success('Xarajat yaratildi');
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Xarajatni saqlab bo‘lmadi');
    },
  });

  return (
    <Modal
      title="Yangi xarajat"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)} initialValues={{ expenseDate: dayjs() }}>
        <Form.Item name="categoryId" label="Kategoriya" rules={[{ required: true }]}>
          <Select
            loading={categoriesQuery.isLoading}
            options={categoriesQuery.data?.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Kategoriyani tanlang"
          />
        </Form.Item>
        <Form.Item name="amount" label="Summa" rules={[{ required: true }]}>
          <InputNumber min={0.01} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="expenseDate" label="Sana" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="paymentMethod" label="To'lov usuli (rejalashtirilgan)" rules={[{ required: true }]}>
          <Select options={METHOD_OPTIONS} />
        </Form.Item>
        <Form.Item name="description" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
