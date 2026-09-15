import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';
import { createGuardian, updateGuardian, type GuardianPayload } from '../api/guardians';
import { FormSection } from './FormSection';
import type { GuardianDetail, GuardianRelationship, GuardianStatus } from '../types';

interface GuardianFormModalProps {
  open: boolean;
  onClose: () => void;
  guardian?: GuardianDetail;
  onSaved?: (guardian: GuardianDetail) => void;
}

interface FormValues {
  fullName: string;
  phone: string;
  email?: string;
  relationshipType?: GuardianRelationship;
  address?: string;
  notes?: string;
  status?: GuardianStatus;
}

const RELATIONSHIP_OPTIONS: Array<{ value: GuardianRelationship; label: string }> = [
  { value: 'MOTHER', label: 'Ona' },
  { value: 'FATHER', label: 'Ota' },
  { value: 'GRANDPARENT', label: 'Bobo/Buvi' },
  { value: 'SIBLING', label: 'Aka/Uka/Opa/Singil' },
  { value: 'RELATIVE', label: "Qarindosh" },
  { value: 'LEGAL_GUARDIAN', label: "Vasiy" },
  { value: 'OTHER', label: 'Boshqa' },
];

export function GuardianFormModal({ open, onClose, guardian, onSaved }: GuardianFormModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const isEdit = !!guardian;

  useEffect(() => {
    if (!open) return;
    if (guardian) {
      form.setFieldsValue({
        fullName: guardian.fullName,
        phone: guardian.phone,
        email: guardian.email ?? undefined,
        relationshipType: guardian.relationshipType,
        address: guardian.address ?? undefined,
        notes: guardian.notes ?? undefined,
        status: guardian.status,
      });
    } else {
      form.resetFields();
    }
  }, [open, guardian, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: GuardianPayload = values;
      return isEdit ? updateGuardian(guardian!.id, payload) : createGuardian(payload);
    },
    onSuccess: (result) => {
      message.success(isEdit ? "Ota-ona/vasiy ma'lumotlari yangilandi" : 'Ota-ona/vasiy yaratildi');
      queryClient.invalidateQueries({ queryKey: ['guardians'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['guardian', guardian!.id] });
      form.resetFields();
      onSaved?.(result);
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Ma'lumotni saqlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={isEdit ? "Ota-ona/vasiyni tahrirlash" : 'Yangi ota-ona/vasiy'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <FormSection title="Shaxsiy ma'lumotlar">
          <Form.Item name="fullName" label="F.I.Sh." rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Telefon" rules={[{ required: true }]}>
            <Input placeholder="+998901234567" />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input />
          </Form.Item>
        </FormSection>

        <FormSection title="Qo'shimcha">
          <Form.Item name="relationshipType" label="Qarindoshlik turi">
            <Select allowClear options={RELATIONSHIP_OPTIONS} />
          </Form.Item>
          <Form.Item name="address" label="Manzil">
            <Input />
          </Form.Item>
          {isEdit && (
            <Form.Item name="status" label="Status">
              <Select options={[{ value: 'ACTIVE', label: 'Faol' }, { value: 'INACTIVE', label: 'Nofaol' }]} />
            </Form.Item>
          )}
          <Form.Item name="notes" label="Izoh" style={{ marginBottom: 0 }}>
            <Input.TextArea />
          </Form.Item>
        </FormSection>
      </Form>
    </Modal>
  );
}
