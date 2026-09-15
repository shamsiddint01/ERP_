import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { createExam } from '../api/exams';
import { listCourses } from '../api/courses';
import { listGroups } from '../api/groups';
import { listTeachers } from '../api/teachers';
import { FormSection } from './FormSection';
import { useAuthStore } from '../store/auth.store';
import type { ExamType } from '../types';

interface CreateExamModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fills and locks the group when opened from a group-scoped page. */
  fixedGroupId?: string;
  fixedCourseId?: string;
}

interface FormValues {
  title: string;
  courseId: string;
  groupId: string;
  teacherEmployeeId?: string;
  date: Dayjs;
  maxScore: number;
  passingScore: number;
  type: ExamType;
  notes?: string;
}

const TYPE_OPTIONS: Array<{ value: ExamType; label: string }> = [
  { value: 'QUIZ', label: 'Test (Quiz)' },
  { value: 'MIDTERM', label: 'Oraliq nazorat' },
  { value: 'FINAL', label: 'Yakuniy nazorat' },
  { value: 'MOCK', label: 'Sinov imtihoni' },
  { value: 'PLACEMENT', label: 'Daraja aniqlash' },
  { value: 'OTHER', label: 'Boshqa' },
];

export function CreateExamModal({ open, onClose, fixedGroupId, fixedCourseId }: CreateExamModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [form] = Form.useForm<FormValues>();
  const selectedCourseId = Form.useWatch('courseId', form) ?? fixedCourseId;
  // A scoped Teacher (own groups only) has no reason to browse the teacher
  // directory — ExamsService.create() already defaults teacherEmployeeId to
  // the acting teacher themselves when omitted. Gating this by the same
  // `teachers:VIEW` permission the /teachers page itself requires avoids a
  // 403 firing (and the field just always being empty) for anyone who can't
  // actually list teachers.
  const canBrowseTeachers = hasPermission('teachers', 'VIEW');

  const coursesQuery = useQuery({ queryKey: ['courses-lookup'], queryFn: () => listCourses({ pageSize: 100 }), enabled: open && !fixedCourseId });
  const groupsQuery = useQuery({
    queryKey: ['groups-lookup', selectedCourseId],
    queryFn: () => listGroups({ courseId: selectedCourseId, pageSize: 100 }),
    enabled: open && !fixedGroupId && !!selectedCourseId,
  });
  const teachersQuery = useQuery({
    queryKey: ['teachers-lookup'],
    queryFn: () => listTeachers({ pageSize: 100 }),
    enabled: open && canBrowseTeachers,
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createExam({
        title: values.title,
        courseId: fixedCourseId ?? values.courseId,
        groupId: fixedGroupId ?? values.groupId,
        teacherEmployeeId: values.teacherEmployeeId,
        date: values.date.toISOString(),
        maxScore: values.maxScore,
        passingScore: values.passingScore,
        type: values.type,
        notes: values.notes,
      }),
    onSuccess: () => {
      message.success('Imtihon yaratildi');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['group-results'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Imtihon yaratib bo'lmadi");
    },
  });

  return (
    <Modal title="Yangi imtihon" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={{ date: dayjs(), maxScore: 100, passingScore: 60, type: 'QUIZ' }} onFinish={(values) => mutation.mutate(values)}>
        <FormSection title="Asosiy ma'lumotlar">
          <Form.Item name="title" label="Sarlavha" rules={[{ required: true }]}>
            <Input placeholder="masalan, Oraliq nazorat — 1-modul" />
          </Form.Item>
          {!fixedCourseId && (
            <Form.Item name="courseId" label="Kurs" rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="label"
                onChange={() => form.setFieldValue('groupId', undefined)}
                options={coursesQuery.data?.items.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Form.Item>
          )}
          {!fixedGroupId && (
            <Form.Item name="groupId" label="Guruh" rules={[{ required: true }]}>
              <Select disabled={!selectedCourseId} options={groupsQuery.data?.items.map((g) => ({ value: g.id, label: g.name }))} placeholder="Avval kursni tanlang" />
            </Form.Item>
          )}
          {canBrowseTeachers && (
            <Form.Item name="teacherEmployeeId" label="O'qituvchi (ixtiyoriy)" style={{ marginBottom: 0 }}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={teachersQuery.data?.items.map((t) => ({ value: t.employeeId, label: t.employee.fullName }))}
              />
            </Form.Item>
          )}
        </FormSection>

        <FormSection title="Baholash">
          <Form.Item name="date" label="Sana" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="type" label="Turi" rules={[{ required: true }]}>
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="maxScore" label="Maksimal ball" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="passingScore" label="O'tish balli" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Izoh" style={{ marginBottom: 0 }}>
            <Input.TextArea />
          </Form.Item>
        </FormSection>
      </Form>
    </Modal>
  );
}
