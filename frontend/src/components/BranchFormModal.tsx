import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import { createBranch, updateBranch, type BranchPayload } from '../api/branches';
import { listTeachers } from '../api/teachers';
import { useAuthStore } from '../store/auth.store';
import { FormSection } from './FormSection';
import type { BranchDetail, BranchStatus } from '../types';

interface BranchFormModalProps {
  open: boolean;
  onClose: () => void;
  branch?: BranchDetail;
}

interface FormValues {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  managerEmployeeId?: string;
  workingHours?: string;
  notes?: string;
  status?: BranchStatus;
}

export function BranchFormModal({ open, onClose, branch }: BranchFormModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [managerSearch, setManagerSearch] = useState('');
  const isEdit = !!branch;
  const canViewTeachers = useAuthStore((state) => state.hasPermission('teachers', 'VIEW'));

  // Search-as-you-type instead of loading every teacher — the manager
  // selector only ever needs a small, relevant slice.
  const managersQuery = useQuery({
    queryKey: ['teachers', { search: managerSearch || undefined, pageSize: 20, forBranchManagerSelect: true }],
    queryFn: () => listTeachers({ search: managerSearch || undefined, pageSize: 20 }),
    enabled: open && canViewTeachers,
  });

  useEffect(() => {
    if (!open) return;
    if (branch) {
      form.setFieldsValue({
        name: branch.name,
        code: branch.code,
        address: branch.address ?? undefined,
        phone: branch.phone ?? undefined,
        email: branch.email ?? undefined,
        managerEmployeeId: branch.managerEmployeeId ?? undefined,
        workingHours: branch.workingHours ?? undefined,
        notes: branch.notes ?? undefined,
        status: branch.status,
      });
    } else {
      form.resetFields();
    }
  }, [open, branch, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: BranchPayload = values;
      return isEdit ? updateBranch(branch!.id, payload) : createBranch(payload);
    },
    onSuccess: () => {
      message.success(isEdit ? 'Filial yangilandi' : 'Filial yaratildi');
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['branch', branch!.id] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Filialni saqlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={isEdit ? 'Filialni tahrirlash' : 'Yangi filial'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={600}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <FormSection title="Asosiy ma'lumotlar">
          <Form.Item name="name" label="Nomi" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="Kod" rules={[{ required: true }]}>
            <Input placeholder="Masalan: BR-MAIN" />
          </Form.Item>
          <Form.Item name="address" label="Manzil">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Telefon">
            <Input placeholder="+998710000000" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]} style={{ marginBottom: 0 }}>
            <Input />
          </Form.Item>
        </FormSection>

        <FormSection title="Qo'shimcha">
          {canViewTeachers && (
            <Form.Item name="managerEmployeeId" label="Filial rahbari">
              <Select
                allowClear
                showSearch
                loading={managersQuery.isLoading}
                filterOption={false}
                onSearch={setManagerSearch}
                options={managersQuery.data?.items.map((t) => ({ value: t.employee.id, label: t.employee.fullName }))}
                placeholder="Ism bo'yicha qidiring"
              />
            </Form.Item>
          )}
          <Form.Item name="workingHours" label="Ish vaqti">
            <Input placeholder="Masalan: Mon-Sat 08:00-21:00" />
          </Form.Item>
          <Form.Item name="notes" label="Izoh">
            <Input.TextArea />
          </Form.Item>
          {isEdit && (
            <Form.Item name="status" label="Status" style={{ marginBottom: 0 }}>
              <Select options={[{ value: 'ACTIVE', label: 'Faol' }, { value: 'INACTIVE', label: 'Nofaol' }]} />
            </Form.Item>
          )}
        </FormSection>
      </Form>
    </Modal>
  );
}
