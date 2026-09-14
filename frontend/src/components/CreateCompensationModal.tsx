import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { createCompensation } from '../api/compensation';
import { listEmployees } from '../api/employees';
import type { SalaryType } from '../types';

interface CreateCompensationModalProps {
  open: boolean;
  onClose: () => void;
  employeeId?: string;
}

interface FormValues {
  employeeId: string;
  baseSalary: number;
  salaryType: SalaryType;
  overtimeRate?: number;
  effectiveFrom: dayjs.Dayjs;
  notes?: string;
}

const SALARY_TYPE_OPTIONS: Array<{ label: string; value: SalaryType }> = [
  { label: 'Oylik (Monthly)', value: 'MONTHLY' },
  { label: 'Kunlik (Daily)', value: 'DAILY' },
  { label: 'Soatlik (Hourly)', value: 'HOURLY' },
  // Phase H — teacher-specific compensation models. baseSalary is still
  // required by the record itself; for a pure PER_LESSON/PER_GROUP teacher
  // with no guaranteed base, set it to 0 (see TeacherProfile for the actual
  // per-lesson/per-group rates these read from at calculation time).
  { label: "Dars uchun (Per lesson) — o'qituvchi uchun", value: 'PER_LESSON' },
  { label: "Guruh uchun (Per group) — o'qituvchi uchun", value: 'PER_GROUP' },
  { label: "Aralash (Mixed) — o'qituvchi uchun", value: 'MIXED' },
];

export function CreateCompensationModal({ open, onClose, employeeId }: CreateCompensationModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const employeesQuery = useQuery({ queryKey: ['employees', { pageSize: 100, status: 'ACTIVE' }], queryFn: () => listEmployees({ pageSize: 100, status: 'ACTIVE' }), enabled: open && !employeeId });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => createCompensation({ ...values, effectiveFrom: values.effectiveFrom.format('YYYY-MM-DD') }),
    onSuccess: () => {
      message.success('Maosh yozuvi yaratildi');
      queryClient.invalidateQueries({ queryKey: ['compensation'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Saqlab bo‘lmadi');
    },
  });

  return (
    <Modal title="Yangi maosh yozuvi" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => mutation.mutate(values)}
        initialValues={{ employeeId, effectiveFrom: dayjs(), salaryType: 'MONTHLY' }}
      >
        {!employeeId && (
          <Form.Item name="employeeId" label="Xodim" rules={[{ required: true }]}>
            <Select
              showSearch
              loading={employeesQuery.isLoading}
              options={employeesQuery.data?.items.map((e) => ({ value: e.id, label: `${e.employeeCode} — ${e.fullName}` }))}
              filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
        )}
        <Form.Item name="salaryType" label="Maosh turi" rules={[{ required: true }]}>
          <Select options={SALARY_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item name="baseSalary" label="Asosiy maosh" rules={[{ required: true }]}>
          <InputNumber min={0.01} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="overtimeRate" label="Qo'shimcha ish stavkasi (soatiga, ixtiyoriy)">
          <InputNumber min={0} style={{ width: '100%' }} placeholder="Bo'sh qoldirilsa avtomatik hisoblanadi (1.5x)" />
        </Form.Item>
        <Form.Item name="effectiveFrom" label="Kuchga kirish sanasi" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="notes" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
