import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, Modal } from 'antd';
import dayjs from 'dayjs';
import { createPayrollPeriod } from '../api/payroll';

interface CreatePayrollPeriodModalProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  name: string;
  range: [dayjs.Dayjs, dayjs.Dayjs];
}

export function CreatePayrollPeriodModal({ open, onClose }: CreatePayrollPeriodModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createPayrollPeriod({ name: values.name, periodStart: values.range[0].format('YYYY-MM-DD'), periodEnd: values.range[1].format('YYYY-MM-DD') }),
    onSuccess: () => {
      message.success("Davr yaratildi");
      queryClient.invalidateQueries({ queryKey: ['payroll-periods'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Saqlab bo‘lmadi');
    },
  });

  return (
    <Modal title="Yangi to'lov davri" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => mutation.mutate(values)}
        initialValues={{ name: dayjs().format('MMMM YYYY'), range: [dayjs().startOf('month'), dayjs().endOf('month')] }}
      >
        <Form.Item name="name" label="Nomi" rules={[{ required: true }]}>
          <Input placeholder="Masalan: Sentyabr 2026" />
        </Form.Item>
        <Form.Item name="range" label="Davr oralig'i" rules={[{ required: true }]}>
          <DatePicker.RangePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
