import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, Modal, Select } from 'antd';
import { listDepartments } from '../api/departments';
import { createPosition } from '../api/positions';

interface CreatePositionModalProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  title: string;
  code: string;
  description?: string;
  departmentId: string;
}

export function CreatePositionModal({ open, onClose }: CreatePositionModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const departmentsQuery = useQuery({
    queryKey: ['departments', { pageSize: 100 }],
    queryFn: () => listDepartments({ pageSize: 100 }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: createPosition,
    onSuccess: () => {
      message.success('Lavozim yaratildi');
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Lavozimni saqlab bo‘lmadi');
    },
  });

  return (
    <Modal title="Yangi lavozim" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="title" label="Nomi" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="code" label="Kod" rules={[{ required: true }]}>
          <Input placeholder="Masalan: SLS-MGR" />
        </Form.Item>
        <Form.Item name="departmentId" label="Bo'lim" rules={[{ required: true }]}>
          <Select
            loading={departmentsQuery.isLoading}
            options={departmentsQuery.data?.items.map((d) => ({ value: d.id, label: d.name }))}
          />
        </Form.Item>
        <Form.Item name="description" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
