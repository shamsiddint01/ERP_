import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { listBranches } from '../api/branches';
import { listCourses } from '../api/courses';
import { listEmployees } from '../api/employees';
import { createLead, updateLead, type LeadPayload } from '../api/leads';
import type { LeadDetail } from '../types';

interface LeadFormModalProps {
  open: boolean;
  onClose: () => void;
  lead?: LeadDetail;
  onSaved?: (lead: LeadDetail) => void;
}

interface FormValues {
  fullName: string;
  phone: string;
  email?: string;
  source?: string;
  preferredCourseId?: string;
  preferredBranchId?: string;
  assignedEmployeeId?: string;
  nextFollowUpAt?: dayjs.Dayjs;
  notes?: string;
}

export function LeadFormModal({ open, onClose, lead, onSaved }: LeadFormModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const isEdit = !!lead;

  const employeesQuery = useQuery({
    queryKey: ['employees', { pageSize: 100, forLeadAssignSelect: true }],
    queryFn: () => listEmployees({ pageSize: 100 }),
    enabled: open,
  });
  const coursesQuery = useQuery({
    queryKey: ['courses', { pageSize: 100, status: 'ACTIVE', forLeadSelect: true }],
    queryFn: () => listCourses({ pageSize: 100, status: 'ACTIVE' }),
    enabled: open,
  });
  const branchesQuery = useQuery({
    queryKey: ['branches', { pageSize: 100, forLeadSelect: true }],
    queryFn: () => listBranches({ pageSize: 100, status: 'ACTIVE' }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (lead) {
      form.setFieldsValue({
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email ?? undefined,
        source: lead.source ?? undefined,
        preferredCourseId: lead.preferredCourseId ?? undefined,
        preferredBranchId: lead.preferredBranchId ?? undefined,
        assignedEmployeeId: lead.assignedEmployeeId ?? undefined,
        nextFollowUpAt: lead.nextFollowUpAt ? dayjs(lead.nextFollowUpAt) : undefined,
        notes: lead.notes ?? undefined,
      });
    } else {
      form.resetFields();
    }
  }, [open, lead, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: LeadPayload = {
        ...values,
        nextFollowUpAt: values.nextFollowUpAt ? values.nextFollowUpAt.toISOString() : undefined,
      };
      return isEdit ? updateLead(lead!.id, payload) : createLead(payload);
    },
    onSuccess: (result) => {
      message.success(isEdit ? 'Lid yangilandi' : 'Lid yaratildi');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['lead', lead!.id] });
      form.resetFields();
      onSaved?.(result);
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Lidni saqlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={isEdit ? 'Lidni tahrirlash' : 'Yangi lid'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="fullName" label="F.I.Sh." rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="phone" label="Telefon" rules={[{ required: true }]}>
          <Input placeholder="+998901234567" />
        </Form.Item>
        <Form.Item name="email" label="Email">
          <Input />
        </Form.Item>
        <Form.Item name="source" label="Manba">
          <Input placeholder="Masalan: Instagram, tavsiya, sayt, ko'cha reklamasi" />
        </Form.Item>
        <Form.Item name="preferredCourseId" label="Qiziqqan kurs">
          <Select
            allowClear
            showSearch
            loading={coursesQuery.isLoading}
            filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
            options={coursesQuery.data?.items.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Form.Item>
        <Form.Item name="preferredBranchId" label="Qiziqqan filial">
          <Select
            allowClear
            loading={branchesQuery.isLoading}
            options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))}
          />
        </Form.Item>
        <Form.Item name="assignedEmployeeId" label="Mas'ul xodim">
          <Select
            allowClear
            showSearch
            loading={employeesQuery.isLoading}
            filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
            options={employeesQuery.data?.items.map((e) => ({ value: e.id, label: e.fullName }))}
          />
        </Form.Item>
        <Form.Item name="nextFollowUpAt" label="Keyingi aloqa sanasi">
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="notes" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
