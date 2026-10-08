import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Col, DatePicker, Divider, Form, Input, Modal, Row, Select } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { listBranches } from '../api/branches';
import { createStudent, updateStudent, type StudentPayload } from '../api/students';
import { FormSection } from './FormSection';
import type { StudentDetail, StudentStatus } from '../types';

interface StudentFormModalProps {
  open: boolean;
  onClose: () => void;
  student?: StudentDetail;
  onSaved?: (student: StudentDetail) => void;
}

interface FormValues {
  studentCode?: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: dayjs.Dayjs;
  gender?: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: StudentStatus;
  source?: string;
  emergencyContact?: string;
  notes?: string;
  branchId?: string;
}

const STATUS_OPTIONS: Array<{ value: StudentStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Faol' },
  { value: 'PAUSED', label: 'Muzlatilgan' },
  { value: 'GRADUATED', label: 'Bitirgan' },
  { value: 'INACTIVE', label: 'Nofaol' },
  { value: 'LEFT', label: "Chiqib ketgan" },
];

export function StudentFormModal({ open, onClose, student, onSaved }: StudentFormModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const isEdit = !!student;

  const branchesQuery = useQuery({
    queryKey: ['branches', { pageSize: 100, forSelect: true }],
    queryFn: () => listBranches({ pageSize: 100, status: 'ACTIVE' }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (student) {
      form.setFieldsValue({
        studentCode: student.studentCode,
        firstName: student.firstName,
        lastName: student.lastName,
        dateOfBirth: student.dateOfBirth ? dayjs(student.dateOfBirth) : undefined,
        gender: student.gender ?? undefined,
        phone: student.phone ?? undefined,
        email: student.email ?? undefined,
        address: student.address ?? undefined,
        status: student.status,
        source: student.source ?? undefined,
        emergencyContact: student.emergencyContact ?? undefined,
        notes: student.notes ?? undefined,
        branchId: student.branchId ?? undefined,
      });
    } else {
      form.resetFields();
    }
  }, [open, student, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: StudentPayload = {
        ...values,
        dateOfBirth: values.dateOfBirth ? values.dateOfBirth.format('YYYY-MM-DD') : undefined,
      };
      return isEdit ? updateStudent(student!.id, payload) : createStudent(payload);
    },
    onSuccess: (result) => {
      message.success(isEdit ? "O'quvchi ma'lumotlari yangilandi" : "O'quvchi yaratildi");
      queryClient.invalidateQueries({ queryKey: ['students'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['student', student!.id] });
      form.resetFields();
      onSaved?.(result);
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "O'quvchini saqlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={isEdit ? "O'quvchini tahrirlash" : "Yangi o'quvchi"}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={640}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <FormSection title="Asosiy ma'lumotlar">
          {isEdit && (
            <Form.Item name="studentCode" label="O'quvchi kodi">
              <Input disabled />
            </Form.Item>
          )}
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="firstName" label="Ism" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="lastName" label="Familiya" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="dateOfBirth" label="Tug'ilgan sana">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="gender" label="Jinsi">
                <Select
                  allowClear
                  options={[
                    { value: 'MALE', label: 'Erkak' },
                    { value: 'FEMALE', label: 'Ayol' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>

        <Divider style={{ margin: '0 0 16px' }} />

        <FormSection title="Aloqa va filial">
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="phone" label="Telefon">
                <Input placeholder="+998901234567" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="email" label="Email">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="address" label="Manzil">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="branchId" label="Filial">
                <Select
                  allowClear
                  loading={branchesQuery.isLoading}
                  options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="emergencyContact" label="Favqulodda aloqa">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>

        <Divider style={{ margin: '0 0 16px' }} />

        <FormSection title="Qo'shimcha">
          <Row gutter={16}>
            {isEdit && (
              <Col xs={24} sm={12}>
                <Form.Item name="status" label="Status">
                  <Select options={STATUS_OPTIONS} />
                </Form.Item>
              </Col>
            )}
            <Col span={isEdit ? 12 : 24}>
              <Form.Item name="source" label="Qayerdan bilgan">
                <Input placeholder="Masalan: Instagram, tavsiya, sayt" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Izoh" style={{ marginBottom: 0 }}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </FormSection>
      </Form>
    </Modal>
  );
}
