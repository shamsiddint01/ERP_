import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useEffect } from 'react';
import { listBranches } from '../api/branches';
import { createClassroom, updateClassroom, type ClassroomPayload } from '../api/classrooms';
import { FormSection } from './FormSection';
import type { ClassroomDetail, ClassroomStatus } from '../types';

interface ClassroomFormModalProps {
  open: boolean;
  onClose: () => void;
  classroom?: ClassroomDetail;
  /** Pre-select a branch when opening the modal from a Branch's own detail page. */
  defaultBranchId?: string;
}

interface FormValues {
  branchId: string;
  name: string;
  roomNumber: string;
  capacity: number;
  equipment?: string;
  notes?: string;
  status?: ClassroomStatus;
}

export function ClassroomFormModal({ open, onClose, classroom, defaultBranchId }: ClassroomFormModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const isEdit = !!classroom;

  const branchesQuery = useQuery({
    queryKey: ['branches', { pageSize: 100, forSelect: true }],
    queryFn: () => listBranches({ pageSize: 100, status: 'ACTIVE' }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (classroom) {
      form.setFieldsValue({
        branchId: classroom.branchId,
        name: classroom.name,
        roomNumber: classroom.roomNumber,
        capacity: classroom.capacity,
        equipment: classroom.equipment ?? undefined,
        notes: classroom.notes ?? undefined,
        status: classroom.status,
      });
    } else {
      form.resetFields();
      if (defaultBranchId) form.setFieldValue('branchId', defaultBranchId);
    }
  }, [open, classroom, defaultBranchId, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: ClassroomPayload = values;
      return isEdit ? updateClassroom(classroom!.id, payload) : createClassroom(payload);
    },
    onSuccess: () => {
      message.success(isEdit ? 'Xona yangilandi' : 'Xona yaratildi');
      queryClient.invalidateQueries({ queryKey: ['classrooms'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['classroom', classroom!.id] });
      queryClient.invalidateQueries({ queryKey: ['branch'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Xonani saqlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={isEdit ? 'Xonani tahrirlash' : 'Yangi xona'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <FormSection title="Asosiy ma'lumotlar">
          <Form.Item name="branchId" label="Filial" rules={[{ required: true, message: 'Filialni tanlang' }]}>
            <Select loading={branchesQuery.isLoading} options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))} disabled={isEdit} />
          </Form.Item>
          <Form.Item name="name" label="Nomi" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="roomNumber" label="Xona raqami" rules={[{ required: true }]}>
            <Input placeholder="Masalan: 101" />
          </Form.Item>
          <Form.Item
            name="capacity"
            label="Sig'imi (o'rindiqlar soni)"
            rules={[
              { required: true, message: "Sig'imni kiriting" },
              { type: 'number', min: 1, message: "Sig'im musbat son bo'lishi kerak" },
            ]}
            style={{ marginBottom: 0 }}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </FormSection>

        <FormSection title="Qo'shimcha">
          <Form.Item name="equipment" label="Jihozlar">
            <Input placeholder="Masalan: proyektor, doska" />
          </Form.Item>
          <Form.Item name="notes" label="Izoh">
            <Input.TextArea />
          </Form.Item>
          {isEdit && (
            <Form.Item name="status" label="Status" style={{ marginBottom: 0 }}>
              <Select
                options={[
                  { value: 'ACTIVE', label: 'Faol' },
                  { value: 'INACTIVE', label: 'Nofaol' },
                  { value: 'MAINTENANCE', label: "Ta'mirlashda" },
                ]}
              />
            </Form.Item>
          )}
        </FormSection>
      </Form>
    </Modal>
  );
}
