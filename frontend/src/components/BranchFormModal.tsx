import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import { listEmployees } from '../api/employees';
import { createBranch, updateBranch, type BranchPayload } from '../api/branches';
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

  // Search-as-you-type instead of loading every employee — the manager
  // selector only ever needs a small, relevant slice (Phase C spec §23).
  const employeesQuery = useQuery({
    queryKey: ['employees', { search: managerSearch || undefined, pageSize: 20, forBranchManagerSelect: true }],
    queryFn: () => listEmployees({ search: managerSearch || undefined, pageSize: 20 }),
    enabled: open,
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
        <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="managerEmployeeId" label="Filial rahbari">
          <Select
            allowClear
            showSearch
            loading={employeesQuery.isLoading}
            filterOption={false}
            onSearch={setManagerSearch}
            options={employeesQuery.data?.items.map((e) => ({ value: e.id, label: e.fullName }))}
            placeholder="Ism bo'yicha qidiring"
          />
        </Form.Item>
        <Form.Item name="workingHours" label="Ish vaqti">
          <Input placeholder="Masalan: Mon-Sat 08:00-21:00" />
        </Form.Item>
        <Form.Item name="notes" label="Izoh">
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
