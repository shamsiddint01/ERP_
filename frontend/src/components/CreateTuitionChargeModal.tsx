import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { createTuitionCharge } from '../api/tuition';
import { listEnrollments } from '../api/enrollments';
import { listStudents } from '../api/students';

interface CreateTuitionChargeModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fills and locks the student when opened from a student-scoped page (e.g. the finance page). */
  fixedStudentId?: string;
}

interface FormValues {
  studentId: string;
  enrollmentId: string;
  billingPeriod: Dayjs;
  amount?: number;
  dueDate: Dayjs;
  description?: string;
}

export function CreateTuitionChargeModal({ open, onClose, fixedStudentId }: CreateTuitionChargeModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [studentSearch, setStudentSearch] = useState('');
  const selectedStudentId = Form.useWatch('studentId', form) ?? fixedStudentId;

  const studentsQuery = useQuery({
    queryKey: ['students-lookup', studentSearch],
    queryFn: () => listStudents({ search: studentSearch || undefined, pageSize: 20 }),
    enabled: open && !fixedStudentId,
  });

  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments-lookup', selectedStudentId],
    queryFn: () => listEnrollments({ studentId: selectedStudentId!, pageSize: 100 }),
    enabled: open && !!selectedStudentId,
  });

  const mutation = useMutation({
    // When fixedStudentId is set, the studentId Form.Item is never rendered
    // (see below) — an AntD Form never submits a value for a field it has no
    // registered control for, so `values.studentId` would come back
    // undefined even with `initialValues` set. Fall back to the prop
    // explicitly rather than trusting the form to carry a value it has no
    // input for.
    mutationFn: (values: FormValues) =>
      createTuitionCharge({
        studentId: fixedStudentId ?? values.studentId,
        enrollmentId: values.enrollmentId,
        billingPeriod: values.billingPeriod.format('YYYY-MM'),
        amount: values.amount,
        dueDate: values.dueDate.toISOString(),
        description: values.description,
      }),
    onSuccess: () => {
      message.success("To'lov (hisob) yaratildi");
      queryClient.invalidateQueries({ queryKey: ['tuition-charges'] });
      queryClient.invalidateQueries({ queryKey: ['student-balance'] });
      queryClient.invalidateQueries({ queryKey: ['student-financial-summary'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Hisob yaratib bo'lmadi");
    },
  });

  return (
    <Modal
      title="Yangi o'quv to'lovi (hisob)"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ studentId: fixedStudentId, dueDate: dayjs().endOf('month'), billingPeriod: dayjs() }}
        onFinish={(values) => mutation.mutate(values)}
      >
        {!fixedStudentId && (
          <Form.Item name="studentId" label="O'quvchi" rules={[{ required: true }]}>
            <Select
              showSearch
              filterOption={false}
              onSearch={setStudentSearch}
              onChange={() => form.setFieldValue('enrollmentId', undefined)}
              options={studentsQuery.data?.items.map((s) => ({ value: s.id, label: `${s.fullName} (${s.studentCode})` }))}
              placeholder="Ism yoki kod bo'yicha qidiring"
            />
          </Form.Item>
        )}
        <Form.Item name="enrollmentId" label="Yozilish (guruh)" rules={[{ required: true }]}>
          <Select
            disabled={!selectedStudentId}
            options={enrollmentsQuery.data?.items.map((e) => ({
              value: e.id,
              label: `${e.group.name} (${e.status}${e.agreedTuition ? `, ${Number(e.agreedTuition).toLocaleString('uz-UZ')}` : ''})`,
            }))}
            placeholder="Avval o'quvchini tanlang"
          />
        </Form.Item>
        <Form.Item name="billingPeriod" label="Hisob-kitob davri (oy)" rules={[{ required: true }]}>
          <DatePicker picker="month" format="YYYY-MM" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="amount" label="Summa (bo'sh qoldirilsa, yozilishdagi to'lov qiymati olinadi)">
          <InputNumber min={0.01} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="dueDate" label="To'lov muddati" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
