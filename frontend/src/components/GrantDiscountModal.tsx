import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { listDiscounts } from '../api/discounts';
import { grantStudentDiscount } from '../api/discounts';
import { listEnrollments } from '../api/enrollments';

interface GrantDiscountModalProps {
  open: boolean;
  onClose: () => void;
  studentId: string;
}

interface FormValues {
  discountId: string;
  enrollmentId?: string;
  startDate: Dayjs;
  endDate?: Dayjs;
  notes?: string;
}

export function GrantDiscountModal({ open, onClose, studentId }: GrantDiscountModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const discountsQuery = useQuery({
    queryKey: ['discounts-lookup'],
    queryFn: () => listDiscounts({ isActive: true, pageSize: 100 }),
    enabled: open,
  });
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments-lookup', studentId],
    queryFn: () => listEnrollments({ studentId, pageSize: 100 }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      grantStudentDiscount(studentId, {
        discountId: values.discountId,
        enrollmentId: values.enrollmentId,
        startDate: values.startDate.toISOString(),
        endDate: values.endDate?.toISOString(),
        notes: values.notes,
      }),
    onSuccess: () => {
      message.success('Chegirma biriktirildi');
      queryClient.invalidateQueries({ queryKey: ['student-discounts', studentId] });
      queryClient.invalidateQueries({ queryKey: ['student-financial-summary', studentId] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Chegirmani biriktirib bo'lmadi");
    },
  });

  return (
    <Modal title="Chegirma biriktirish" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={{ startDate: dayjs() }} onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="discountId" label="Chegirma" rules={[{ required: true }]}>
          <Select
            options={discountsQuery.data?.items.map((d) => ({
              value: d.id,
              label: `${d.name} (${d.type === 'PERCENTAGE' ? `${Number(d.value)}%` : Number(d.value).toLocaleString('uz-UZ')})`,
            }))}
          />
        </Form.Item>
        <Form.Item name="enrollmentId" label="Faqat bitta yozilish uchun (ixtiyoriy)">
          <Select
            allowClear
            placeholder="Barcha yozilishlar uchun"
            options={enrollmentsQuery.data?.items.map((e) => ({ value: e.id, label: e.group.name }))}
          />
        </Form.Item>
        <Form.Item name="startDate" label="Boshlanish sanasi" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="endDate" label="Tugash sanasi (ixtiyoriy — doimiy bo'lsa bo'sh qoldiring)">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="notes" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
