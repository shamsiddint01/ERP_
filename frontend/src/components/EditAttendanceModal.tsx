import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';
import { updateStudentAttendance } from '../api/studentAttendance';
import { ATTENDANCE_STATUS_OPTIONS } from '../utils/attendanceStatus';
import type { StudentAttendanceDetail, StudentAttendanceStatus } from '../types';

interface EditAttendanceModalProps {
  open: boolean;
  onClose: () => void;
  record: StudentAttendanceDetail;
}

interface FormValues {
  status: StudentAttendanceStatus;
  notes?: string;
}

/** Corrections only — lessonId/studentId are fixed at creation (see UpdateStudentAttendanceDto on the backend). */
export function EditAttendanceModal({ open, onClose, record }: EditAttendanceModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    if (open) form.setFieldsValue({ status: record.status, notes: record.notes ?? undefined });
  }, [open, record, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => updateStudentAttendance(record.id, values),
    onSuccess: () => {
      message.success('Davomat tuzatildi');
      queryClient.invalidateQueries({ queryKey: ['student-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['student-attendance-history'] });
      queryClient.invalidateQueries({ queryKey: ['group-attendance'] });
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Tuzatib bo'lmadi");
    },
  });

  return (
    <Modal title={`${record.student.fullName} — davomatni tuzatish`} open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="status" label="Status" rules={[{ required: true }]}>
          <Select options={ATTENDANCE_STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item name="notes" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
