import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { listBranches } from '../api/branches';
import { listClassrooms } from '../api/classrooms';
import { listGroups } from '../api/groups';
import { createLesson, updateLesson, type CreateLessonPayload } from '../api/lessons';
import { listSchedules } from '../api/schedules';
import { listTeachers } from '../api/teachers';
import { FormSection } from './FormSection';
import type { LessonDetail, ScheduleDayOfWeek } from '../types';

const DAY_LABELS: Record<ScheduleDayOfWeek, string> = {
  MONDAY: 'Dushanba',
  TUESDAY: 'Seshanba',
  WEDNESDAY: 'Chorshanba',
  THURSDAY: 'Payshanba',
  FRIDAY: 'Juma',
  SATURDAY: 'Shanba',
  SUNDAY: 'Yakshanba',
};

interface LessonFormModalProps {
  open: boolean;
  onClose: () => void;
  lesson?: LessonDetail;
  /** Preselects and locks the group when opened from a Schedule/Group context; otherwise the user picks freely (ad-hoc lesson). */
  defaultGroupId?: string;
}

interface FormValues {
  groupId: string;
  branchId: string;
  scheduleId?: string;
  teacherEmployeeId?: string;
  classroomId?: string;
  scheduledStart: dayjs.Dayjs;
  scheduledEnd: dayjs.Dayjs;
  topic?: string;
  homework?: string;
  notes?: string;
}

/** Once a lesson is COMPLETED/CANCELLED/NO_SHOW its when/who/where are historical and locked — only topic/homework/notes may still change (mirrors LessonsService.LOCKED_STATUSES). */
const LOCKED_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

export function LessonFormModal({ open, onClose, lesson, defaultGroupId }: LessonFormModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const groupId = Form.useWatch('groupId', form);
  const branchId = Form.useWatch('branchId', form);
  const isEdit = !!lesson;
  const groupLocked = isEdit || !!defaultGroupId;
  const schedulingLocked = isEdit && LOCKED_STATUSES.has(lesson!.status);

  const groupsQuery = useQuery({ queryKey: ['groups', { pageSize: 100, forLessonSelect: true }], queryFn: () => listGroups({ pageSize: 100 }), enabled: open });
  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100, forLessonSelect: true }], queryFn: () => listBranches({ pageSize: 100 }), enabled: open });
  const schedulesQuery = useQuery({
    queryKey: ['schedules', { groupId, pageSize: 100, status: 'ACTIVE', forLessonSelect: true }],
    queryFn: () => listSchedules({ groupId, pageSize: 100, status: 'ACTIVE' }),
    enabled: open && !!groupId && !isEdit,
  });
  const classroomsQuery = useQuery({
    queryKey: ['classrooms', { branchId, pageSize: 100, status: 'ACTIVE', forLessonSelect: true }],
    queryFn: () => listClassrooms({ branchId, pageSize: 100, status: 'ACTIVE' }),
    enabled: open && !!branchId,
  });
  const teachersQuery = useQuery({ queryKey: ['teachers', { pageSize: 100, status: 'ACTIVE', forLessonSelect: true }], queryFn: () => listTeachers({ pageSize: 100, status: 'ACTIVE' }), enabled: open });

  useEffect(() => {
    if (!open) return;
    if (lesson) {
      form.setFieldsValue({
        groupId: lesson.groupId,
        branchId: lesson.branchId,
        scheduleId: lesson.scheduleId ?? undefined,
        teacherEmployeeId: lesson.teacherEmployeeId ?? undefined,
        classroomId: lesson.classroomId ?? undefined,
        scheduledStart: dayjs(lesson.scheduledStart),
        scheduledEnd: dayjs(lesson.scheduledEnd),
        topic: lesson.topic ?? undefined,
        homework: lesson.homework ?? undefined,
        notes: lesson.notes ?? undefined,
      });
    } else {
      form.resetFields();
      if (defaultGroupId) {
        form.setFieldValue('groupId', defaultGroupId);
        const group = groupsQuery.data?.items.find((g) => g.id === defaultGroupId);
        if (group) form.setFieldValue('branchId', group.branchId);
      }
    }
  }, [open, lesson, defaultGroupId, form, groupsQuery.data]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (isEdit) {
        return updateLesson(lesson!.id, {
          teacherEmployeeId: values.teacherEmployeeId,
          classroomId: values.classroomId,
          scheduledStart: values.scheduledStart.toISOString(),
          scheduledEnd: values.scheduledEnd.toISOString(),
          topic: values.topic,
          homework: values.homework,
          notes: values.notes,
        });
      }
      const payload: CreateLessonPayload = {
        ...values,
        scheduledStart: values.scheduledStart.toISOString(),
        scheduledEnd: values.scheduledEnd.toISOString(),
      };
      return createLesson(payload);
    },
    onSuccess: () => {
      message.success(isEdit ? 'Dars yangilandi' : 'Dars yaratildi');
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['lesson', lesson!.id] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Darsni saqlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={isEdit ? 'Darsni tahrirlash' : "Yangi dars (qo'shimcha)"}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={640}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <FormSection title="Guruh va joylashuv">
          <Form.Item name="groupId" label="Guruh" rules={[{ required: true }]}>
            <Select
              disabled={groupLocked}
              showSearch
              loading={groupsQuery.isLoading}
              filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
              options={groupsQuery.data?.items.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))}
              onChange={(value) => {
                const group = groupsQuery.data?.items.find((g) => g.id === value);
                form.setFieldValue('branchId', group?.branchId);
                form.setFieldValue('classroomId', undefined);
                form.setFieldValue('scheduleId', undefined);
              }}
            />
          </Form.Item>
          <Form.Item name="branchId" label="Filial" tooltip="Guruhning o'z filialidan olinadi" rules={[{ required: true }]}>
            <Select disabled loading={branchesQuery.isLoading} options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))} />
          </Form.Item>
          {!isEdit && (
            <Form.Item name="scheduleId" label="Bog'liq dars jadvali (ixtiyoriy)">
              <Select
                allowClear
                disabled={!groupId}
                loading={schedulesQuery.isLoading}
                options={schedulesQuery.data?.items.map((s) => ({ value: s.id, label: `${DAY_LABELS[s.dayOfWeek]} ${s.startTime}-${s.endTime}` }))}
                placeholder="Mustaqil (jadvalga bog'liq bo'lmagan) dars"
              />
            </Form.Item>
          )}
          <Form.Item name="teacherEmployeeId" label="O'qituvchi">
            <Select
              allowClear
              showSearch
              disabled={schedulingLocked}
              loading={teachersQuery.isLoading}
              filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
              options={teachersQuery.data?.items.map((t) => ({ value: t.employeeId, label: t.employee.fullName }))}
            />
          </Form.Item>
          <Form.Item name="classroomId" label="Xona" style={{ marginBottom: 0 }}>
            <Select
              allowClear
              disabled={schedulingLocked || !branchId}
              loading={classroomsQuery.isLoading}
              options={classroomsQuery.data?.items.map((c) => ({ value: c.id, label: `${c.name} (${c.roomNumber})` }))}
            />
          </Form.Item>
        </FormSection>

        <FormSection title="Vaqt">
          <Form.Item name="scheduledStart" label="Boshlanish vaqti" rules={[{ required: true }]}>
            <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} disabled={schedulingLocked} />
          </Form.Item>
          <Form.Item
            name="scheduledEnd"
            label="Tugash vaqti"
            dependencies={['scheduledStart']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value: dayjs.Dayjs | undefined) {
                  const start = getFieldValue('scheduledStart') as dayjs.Dayjs | undefined;
                  if (!value || !start || value.isAfter(start)) return Promise.resolve();
                  return Promise.reject(new Error('Tugash vaqti boshlanish vaqtidan keyin bo\'lishi kerak'));
                },
              }),
            ]}
            style={{ marginBottom: 0 }}
          >
            <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} disabled={schedulingLocked} />
          </Form.Item>
        </FormSection>

        <FormSection title="Tafsilotlar">
          <Form.Item name="topic" label="Mavzu">
            <Input placeholder="Masalan: Present Simple" />
          </Form.Item>
          <Form.Item name="homework" label="Uy vazifasi">
            <Input.TextArea />
          </Form.Item>
          <Form.Item name="notes" label="Izoh" style={{ marginBottom: 0 }}>
            <Input.TextArea />
          </Form.Item>
        </FormSection>
      </Form>
    </Modal>
  );
}
