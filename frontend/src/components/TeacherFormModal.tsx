import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import { listEmployees } from '../api/employees';
import { createTeacher, updateTeacher, type CreateTeacherPayload } from '../api/teachers';
import type { TeacherDetail, TeacherProfileStatus } from '../types';

interface TeacherFormModalProps {
  open: boolean;
  onClose: () => void;
  teacher?: TeacherDetail;
}

interface FormValues {
  employeeId: string;
  bio?: string;
  specialization?: string;
  qualification?: string;
  experienceYears?: number;
  hourlyRate?: number;
  perLessonRate?: number;
  perGroupRate?: number;
  status?: TeacherProfileStatus;
}

export function TeacherFormModal({ open, onClose, teacher }: TeacherFormModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [employeeSearch, setEmployeeSearch] = useState('');
  const isEdit = !!teacher;

  // Search-as-you-type instead of loading every employee (Phase D §6).
  const employeesQuery = useQuery({
    queryKey: ['employees', { search: employeeSearch || undefined, pageSize: 20, forTeacherSelect: true }],
    queryFn: () => listEmployees({ search: employeeSearch || undefined, pageSize: 20 }),
    enabled: open && !isEdit,
  });

  useEffect(() => {
    if (!open) return;
    if (teacher) {
      form.setFieldsValue({
        employeeId: teacher.employeeId,
        bio: teacher.bio ?? undefined,
        specialization: teacher.specialization ?? undefined,
        qualification: teacher.qualification ?? undefined,
        experienceYears: teacher.experienceYears ?? undefined,
        hourlyRate: teacher.hourlyRate ? Number(teacher.hourlyRate) : undefined,
        perLessonRate: teacher.perLessonRate ? Number(teacher.perLessonRate) : undefined,
        perGroupRate: teacher.perGroupRate ? Number(teacher.perGroupRate) : undefined,
        status: teacher.status,
      });
    } else {
      form.resetFields();
    }
  }, [open, teacher, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (isEdit) {
        const { employeeId: _employeeId, ...updatePayload } = values;
        return updateTeacher(teacher!.id, updatePayload);
      }
      return createTeacher(values as CreateTeacherPayload);
    },
    onSuccess: () => {
      message.success(isEdit ? "O'qituvchi profili yangilandi" : "O'qituvchi profili yaratildi");
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['teacher', teacher!.id] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "O'qituvchi profilini saqlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={isEdit ? "O'qituvchi profilini tahrirlash" : "Yangi o'qituvchi profili"}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={600}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        {!isEdit && (
          <Form.Item name="employeeId" label="Xodim" rules={[{ required: true, message: 'Xodimni tanlang' }]}>
            <Select
              showSearch
              loading={employeesQuery.isLoading}
              filterOption={false}
              onSearch={setEmployeeSearch}
              options={employeesQuery.data?.items.map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }))}
              placeholder="Ism bo'yicha qidiring"
            />
          </Form.Item>
        )}
        <Form.Item name="specialization" label="Mutaxassislik">
          <Input placeholder="Masalan: IELTS, Umumiy ingliz tili" />
        </Form.Item>
        <Form.Item name="qualification" label="Malaka/Sertifikat">
          <Input placeholder="Masalan: CELTA sertifikati" />
        </Form.Item>
        <Form.Item name="experienceYears" label="Ish tajribasi (yil)">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="bio" label="Bio">
          <Input.TextArea />
        </Form.Item>
        <Form.Item name="hourlyRate" label="Soatlik stavka (so'm)">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="perLessonRate" label="Dars uchun stavka (so'm)">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="perGroupRate" label="Guruh uchun stavka (so'm)">
          <InputNumber min={0} style={{ width: '100%' }} />
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
