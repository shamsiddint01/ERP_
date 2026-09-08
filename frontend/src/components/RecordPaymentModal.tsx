import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useEffect } from 'react';
import { createPayment } from '../api/payments';
import type { PaymentMethod } from '../types';

interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  referenceType: 'ORDER' | 'INVOICE' | 'PURCHASE_ORDER';
  referenceId: string;
  remaining: number;
}

interface FormValues {
  amount: number;
  method: PaymentMethod;
  externalTransactionId?: string;
  notes?: string;
}

const METHOD_OPTIONS: Array<{ label: string; value: PaymentMethod }> = [
  { label: 'Naqd (Cash)', value: 'CASH' },
  { label: 'Karta (Card)', value: 'CARD' },
  { label: "O'tkazma (Bank transfer)", value: 'BANK_TRANSFER' },
  { label: 'Onlayn (Online)', value: 'ONLINE' },
  { label: 'Chek (Cheque)', value: 'CHEQUE' },
];

export function RecordPaymentModal({ open, onClose, referenceType, referenceId, remaining }: RecordPaymentModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    if (open) form.setFieldsValue({ amount: remaining, method: 'CASH' });
  }, [open, remaining, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => createPayment({ referenceType, referenceId, ...values }),
    onSuccess: () => {
      message.success("To'lov qabul qilindi");
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['customer'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['supplier'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "To'lovni saqlab bo'lmadi");
    },
  });

  return (
    <Modal title="To'lov qabul qilish" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item label="Qolgan summa">
          <Input value={remaining.toLocaleString('uz-UZ')} disabled />
        </Form.Item>
        <Form.Item name="amount" label="To'lov summasi" rules={[{ required: true }]}>
          <InputNumber min={0.01} max={remaining} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="method" label="To'lov usuli" rules={[{ required: true }]}>
          <Select options={METHOD_OPTIONS} />
        </Form.Item>
        <Form.Item name="externalTransactionId" label="Tranzaksiya ID (ixtiyoriy)">
          <Input />
        </Form.Item>
        <Form.Item name="notes" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
