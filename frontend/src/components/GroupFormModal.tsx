import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { listBranches } from '../api/branches';
import { listClassrooms } from '../api/classrooms';
import { listCourses } from '../api/courses';
import { createGroup, updateGroup, type GroupPayload } from '../api/groups';
import { listTeachers } from '../api/teachers';
import type { CourseLevel, GroupDetail, StudentGroupStatus } from '../types';

interface GroupFormModalProps {
  open: boolean;
  onClose: () => void;
  group?: GroupDetail;
}

interface FormValues {
  code: string;
  name: string;
  courseId: string;
  branchId: string;
  classroomId?: string;
  teacherEmployeeId?: string;
  capacity?: number;
  tuitionAmount?: number;
  level?: CourseLevel;
  startDate: dayjs.Dayjs;
  endDate?: dayjs.Dayjs;
  status?: StudentGroupStatus;
  notes?: string;
}

const LEVEL_OPTIONS: Array<{ value: CourseLevel; label: string }> = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'ELEMENTARY', label: 'Elementary' },
  { value: 'PRE_INTERMEDIATE', label: 'Pre-Intermediate' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'UPPER_INTERMEDIATE', label: 'Upper-Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
];

const STATUS_OPTIONS: Array<{ value: StudentGroupStatus; label: string }> = [
  { value: 'PLANNED', label: 'Rejalashtirilgan' },
  { value: 'ACTIVE', label: 'Faol' },
  { value: 'PAUSED', label: 'Muzlatilgan' },
  { value: 'COMPLETED', label: 'Yakunlangan' },
  { value: 'CANCELLED', label: 'Bekor qilingan' },
];

export function GroupFormModal({ open, onClose, group }: GroupFormModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  // Reactively reads the form's own branchId field instead of mirroring it
  // into separate state — one source of truth, no extra effect-driven sync.
  const branchId = Form.useWatch('branchId', form);
  const isEdit = !!group;

  const coursesQuery = useQuery({ queryKey: ['courses', { pageSize: 100, status: 'ACTIVE', forGroupSelect: true }], queryFn: () => listCourses({ pageSize: 100, status: 'ACTIVE' }), enabled: open });
  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100, status: 'ACTIVE', forGroupSelect: true }], queryFn: () => listBranches({ pageSize: 100, status: 'ACTIVE' }), enabled: open });
  // Classroom options are filtered to the selected branch — never show a room from another branch (Phase D §28).
  const classroomsQuery = useQuery({
    queryKey: ['classrooms', { branchId, pageSize: 100, status: 'ACTIVE', forGroupSelect: true }],
    queryFn: () => listClassrooms({ branchId, pageSize: 100, status: 'ACTIVE' }),
    enabled: open && !!branchId,
  });
  // Only active TeacherProfiles are offered — never an arbitrary Employee (Phase D §28).
  const teachersQuery = useQuery({ queryKey: ['teachers', { pageSize: 100, status: 'ACTIVE', forGroupSelect: true }], queryFn: () => listTeachers({ pageSize: 100, status: 'ACTIVE' }), enabled: open });

  useEffect(() => {
    if (!open) return;
    if (group) {
      form.setFieldsValue({
        code: group.code,
        name: group.name,
        courseId: group.courseId,
        branchId: group.branchId,
        classroomId: group.classroomId ?? undefined,
        teacherEmployeeId: group.teacherEmployeeId ?? undefined,
        capacity: group.capacity,
        tuitionAmount: group.tuitionAmount ? Number(group.tuitionAmount) : undefined,
        level: group.level ?? undefined,
        startDate: dayjs(group.startDate),
        endDate: group.endDate ? dayjs(group.endDate) : undefined,
        status: group.status,
        notes: group.notes ?? undefined,
      });
    } else {
      form.resetFields();
    }
  }, [open, group, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: GroupPayload = {
        ...values,
        startDate: values.startDate.format('YYYY-MM-DD'),
        endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : undefined,
      };
      return isEdit ? updateGroup(group!.id, payload) : createGroup(payload);
    },
    onSuccess: () => {
      message.success(isEdit ? 'Guruh yangilandi' : 'Guruh yaratildi');
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['group', group!.id] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Guruhni saqlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={isEdit ? 'Guruhni tahrirlash' : 'Yangi guruh'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={640}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)} initialValues={{ capacity: 12 }}>
        <Form.Item name="code" label="Kod" rules={[{ required: true }]}>
          <Input placeholder="Masalan: ENG-A1-03" />
        </Form.Item>
        <Form.Item name="name" label="Nomi" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="courseId" label="Kurs" rules={[{ required: true }]}>
          <Select loading={coursesQuery.isLoading} options={coursesQuery.data?.items.map((c) => ({ value: c.id, label: c.name }))} />
        </Form.Item>
        <Form.Item name="branchId" label="Filial" rules={[{ required: true }]}>
          <Select
            loading={branchesQuery.isLoading}
            options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))}
            onChange={() => form.setFieldValue('classroomId', undefined)}
          />
        </Form.Item>
        <Form.Item name="classroomId" label="Xona">
          <Select
            allowClear
            disabled={!branchId}
            loading={classroomsQuery.isLoading}
            options={classroomsQuery.data?.items.map((c) => ({ value: c.id, label: `${c.name} (${c.roomNumber})` }))}
            placeholder={branchId ? 'Xonani tanlang' : "Avval filialni tanlang"}
          />
        </Form.Item>
        <Form.Item name="teacherEmployeeId" label="O'qituvchi">
          <Select
            allowClear
            showSearch
            loading={teachersQuery.isLoading}
            filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
            options={teachersQuery.data?.items.map((t) => ({ value: t.employeeId, label: t.employee.fullName }))}
            placeholder="Faol o'qituvchilar ro'yxatidan tanlang"
          />
        </Form.Item>
        <Form.Item name="capacity" label="Sig'imi" rules={[{ type: 'number', min: 1, message: "Sig'im musbat son bo'lishi kerak" }]}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="tuitionAmount" label="O'quv to'lovi (so'm)">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="level" label="Daraja">
          <Select allowClear options={LEVEL_OPTIONS} />
        </Form.Item>
        <Form.Item name="startDate" label="Boshlanish sanasi" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="endDate" label="Tugash sanasi">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        {isEdit && (
          <Form.Item name="status" label="Status">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        )}
        <Form.Item name="notes" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
