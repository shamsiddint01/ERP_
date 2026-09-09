import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, Modal } from 'antd';
import { createDepartment } from '../api/departments';

interface CreateDepartmentModalProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  name: string;
  code: string;
  description?: string;
}

export function CreateDepartmentModal({ open, onClose }: CreateDepartmentModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const mutation = useMutation({
    mutationFn: createDepartment,
    onSuccess: () => {
      message.success("Bo'lim yaratildi");
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Bo‘limni saqlab bo‘lmadi');
    },
  });

  return (
    <Modal title="Yangi bo'lim" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="name" label="Nomi" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="code" label="Kod" rules={[{ required: true }]}>
          <Input placeholder="Masalan: SALES" />
        </Form.Item>
        <Form.Item name="description" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
