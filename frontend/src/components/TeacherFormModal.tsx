import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Col, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import { useEffect } from 'react';
import { createTeacher, updateTeacher } from '../api/teachers';
import { FormSection } from './FormSection';
import type { TeacherDetail, TeacherProfileStatus } from '../types';

interface TeacherFormModalProps {
  open: boolean;
  onClose: () => void;
  teacher?: TeacherDetail;
}

interface FormValues {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  bio?: string;
  specialization?: string;
  qualification?: string;
  experienceYears?: number;
  salaryPercent?: number | null;
  status?: TeacherProfileStatus;
}

export function TeacherFormModal({ open, onClose, teacher }: TeacherFormModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const isEdit = !!teacher;

  useEffect(() => {
    if (!open) return;
    if (teacher) {
      form.setFieldsValue({
        firstName: teacher.employee.firstName,
        lastName: teacher.employee.lastName,
        phone: teacher.employee.phone,
        email: teacher.employee.email ?? undefined,
        bio: teacher.bio ?? undefined,
        specialization: teacher.specialization ?? undefined,
        qualification: teacher.qualification ?? undefined,
        experienceYears: teacher.experienceYears ?? undefined,
        salaryPercent: teacher.salaryPercent === null ? undefined : Number(teacher.salaryPercent),
        status: teacher.status,
      });
    } else {
      form.resetFields();
    }
  }, [open, teacher, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      // A cleared % field is sent as null on edit (= "not set"), and left out on create.
      const payload = { ...values, email: values.email || undefined, salaryPercent: values.salaryPercent ?? (isEdit ? null : undefined) };
      return isEdit ? updateTeacher(teacher!.id, payload) : createTeacher(payload);
    },
    onSuccess: () => {
      message.success(isEdit ? "O'qituvchi ma'lumotlari yangilandi" : "O'qituvchi qo'shildi");
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['teacher', teacher!.id] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "O'qituvchini saqlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={isEdit ? "O'qituvchini tahrirlash" : "Yangi o'qituvchi"}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={600}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <FormSection title="Shaxsiy ma'lumotlar">
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="firstName" label="Ism" rules={[{ required: true, message: 'Ismni kiriting' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="lastName" label="Familiya" rules={[{ required: true, message: 'Familiyani kiriting' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="phone" label="Telefon" rules={[{ required: true, message: 'Telefon raqamini kiriting' }]} style={{ marginBottom: 0 }}>
                <Input placeholder="+998 90 123 45 67" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="email" label="Email" rules={[{ type: 'email', message: "Email noto'g'ri" }]} style={{ marginBottom: 0 }}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>

        <FormSection title="Kasbiy ma'lumotlar">
          <Form.Item name="specialization" label="Mutaxassislik">
            <Input placeholder="Masalan: IELTS, Umumiy ingliz tili" />
          </Form.Item>
          <Form.Item name="qualification" label="Malaka/Sertifikat">
            <Input placeholder="Masalan: CELTA sertifikati" />
          </Form.Item>
          <Form.Item name="experienceYears" label="Ish tajribasi (yil)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="salaryPercent" label="Maosh foizi (%)" extra="Guruhlari o'quvchilari to'lagan summaning necha foizi ustozga maosh sifatida hisoblanadi">
            <InputNumber min={0} max={100} step={5} precision={2} placeholder="Masalan: 40" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="bio" label="Bio" style={{ marginBottom: isEdit ? undefined : 0 }}>
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
