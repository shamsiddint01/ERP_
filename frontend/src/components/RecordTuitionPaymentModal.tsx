import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, InputNumber, Modal, Segmented } from 'antd';
import { useEffect } from 'react';
import { allocatePayment, createPayment } from '../api/payments';
import type { PaymentMethod } from '../types';

interface RecordTuitionPaymentModalProps {
  open: boolean;
  onClose: () => void;
  studentId: string;
  tuitionChargeId: string;
  outstanding: number;
}

interface FormValues {
  amount: number;
  method: PaymentMethod;
  notes?: string;
}

const METHOD_OPTIONS: Array<{ label: string; value: PaymentMethod }> = [
  { label: 'Naqd', value: 'CASH' },
  { label: 'Karta', value: 'CARD' },
];

/**
 * Records a tuition payment AND allocates it to this one charge in a single
 * user action: creates the Payment (referenceType TUITION_CHARGE, referenceId
 * = the student — see api/payments.ts), then immediately calls the separate
 * /payments/:id/allocate endpoint against the charge this modal was opened
 * from. Two real API calls under the hood (matching the backend's own
 * "reuse the payment API, allocation is a separate action" design), but one
 * step for the user in the common case of paying off a single charge.
 */
export function RecordTuitionPaymentModal({ open, onClose, studentId, tuitionChargeId, outstanding }: RecordTuitionPaymentModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    if (open) form.setFieldsValue({ amount: outstanding, method: 'CASH' });
  }, [open, outstanding, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payment = await createPayment({ referenceType: 'TUITION_CHARGE', referenceId: studentId, amount: values.amount, method: values.method, notes: values.notes });
      await allocatePayment(payment.id, { allocations: [{ tuitionChargeId, amount: values.amount }] });
      return payment;
    },
    onSuccess: () => {
      message.success("To'lov qabul qilindi va hisobga o'tkazildi");
      queryClient.invalidateQueries({ queryKey: ['tuition-charge', tuitionChargeId] });
      queryClient.invalidateQueries({ queryKey: ['tuition-charges'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['student-balance'] });
      queryClient.invalidateQueries({ queryKey: ['student-financial-summary'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "To'lovni saqlab bo'lmadi");
    },
  });

  return (
    <Modal title="To'lov qabul qilish" open={open} onCancel={onClose} onOk={() => form.submit()} okText="Qabul qilish" cancelText="Bekor" confirmLoading={mutation.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item label="Qolgan summa">
          <Input value={outstanding.toLocaleString('uz-UZ')} disabled />
        </Form.Item>
        <Form.Item name="amount" label="To'lov summasi" rules={[{ required: true }]}>
          <InputNumber min={0.01} max={outstanding} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="method" label="To'lov usuli" rules={[{ required: true }]}>
          <Segmented block options={METHOD_OPTIONS} />
        </Form.Item>
        <Form.Item name="notes" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
