import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';
import { createCourseCategory, updateCourseCategory, type CourseCategoryPayload } from '../api/courseCategories';
import type { CourseCategoryListItem, CourseCategoryStatus } from '../types';

interface CourseCategoryFormModalProps {
  open: boolean;
  onClose: () => void;
  category?: CourseCategoryListItem;
}

interface FormValues {
  name: string;
  code: string;
  description?: string;
  status?: CourseCategoryStatus;
}

export function CourseCategoryFormModal({ open, onClose, category }: CourseCategoryFormModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const isEdit = !!category;

  useEffect(() => {
    if (!open) return;
    if (category) {
      form.setFieldsValue({ name: category.name, code: category.code, description: category.description ?? undefined, status: category.status });
    } else {
      form.resetFields();
    }
  }, [open, category, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: CourseCategoryPayload = values;
      return isEdit ? updateCourseCategory(category!.id, payload) : createCourseCategory(payload);
    },
    onSuccess: () => {
      message.success(isEdit ? 'Kategoriya yangilandi' : 'Kategoriya yaratildi');
      queryClient.invalidateQueries({ queryKey: ['course-categories'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Kategoriyani saqlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={isEdit ? 'Kategoriyani tahrirlash' : 'Yangi kurs kategoriyasi'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="name" label="Nomi" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="code" label="Kod" rules={[{ required: true }]}>
          <Input placeholder="Masalan: CAT-LANG" />
        </Form.Item>
        <Form.Item name="description" label="Izoh">
          <Input.TextArea />
        </Form.Item>
        {isEdit && (
          <Form.Item name="status" label="Status">
            <Select options={[{ value: 'ACTIVE', label: 'Faol' }, { value: 'INACTIVE', label: 'Nofaol' }]} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
