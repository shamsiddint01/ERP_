import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, Modal, Typography } from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { convertLead, type ConvertLeadPayload } from '../api/leads';
import type { LeadDetail } from '../types';

interface ConvertLeadModalProps {
  open: boolean;
  onClose: () => void;
  lead: LeadDetail;
}

interface FormValues {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: dayjs.Dayjs;
}

export function ConvertLeadModal({ open, onClose, lead }: ConvertLeadModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: ConvertLeadPayload = {
        firstName: values.firstName || undefined,
        lastName: values.lastName || undefined,
        dateOfBirth: values.dateOfBirth ? values.dateOfBirth.format('YYYY-MM-DD') : undefined,
      };
      return convertLead(lead.id, payload);
    },
    onSuccess: (student) => {
      message.success(`${student.fullName} o'quvchi sifatida ro'yxatdan o'tkazildi`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      form.resetFields();
      onClose();
      navigate(`/students/${student.id}`);
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Lidni o'quvchiga aylantirib bo'lmadi");
    },
  });

  return (
    <Modal
      title="Lidni o'quvchiga aylantirish"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      okText="Aylantirish"
    >
      <Typography.Paragraph type="secondary">
        <strong>{lead.fullName}</strong> ({lead.phone}) uchun yangi o'quvchi profili yaratiladi. Ism-familiya bo'sh qoldirilsa, lid
        F.I.Sh.dan avtomatik ajratiladi. Lid tarixiy yozuv sifatida saqlanib qoladi.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="firstName" label="Ism (ixtiyoriy — lid F.I.Sh.dan olinadi)">
          <Input placeholder={lead.fullName.split(/\s+/)[0]} />
        </Form.Item>
        <Form.Item name="lastName" label="Familiya (ixtiyoriy)">
          <Input placeholder={lead.fullName.split(/\s+/).slice(1).join(' ')} />
        </Form.Item>
        <Form.Item name="dateOfBirth" label="Tug'ilgan sana">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
