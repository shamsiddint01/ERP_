import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, Modal, Select, TimePicker } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { listBranches } from '../api/branches';
import { listClassrooms } from '../api/classrooms';
import { listGroups } from '../api/groups';
import { createSchedule, updateSchedule, type SchedulePayload } from '../api/schedules';
import { listTeachers } from '../api/teachers';
import type { ScheduleDayOfWeek, ScheduleDetail, ScheduleStatus } from '../types';

interface ScheduleFormModalProps {
  open: boolean;
  onClose: () => void;
  schedule?: ScheduleDetail;
  /** Preselects and locks the group when opened from a Group's own detail page. */
  defaultGroupId?: string;
}

interface FormValues {
  groupId: string;
  branchId: string;
  classroomId?: string;
  teacherEmployeeId?: string;
  dayOfWeek: ScheduleDayOfWeek;
  startTime: dayjs.Dayjs;
  endTime: dayjs.Dayjs;
  startDate: dayjs.Dayjs;
  endDate?: dayjs.Dayjs;
  status?: ScheduleStatus;
  notes?: string;
}

const DAY_OPTIONS: Array<{ value: ScheduleDayOfWeek; label: string }> = [
  { value: 'MONDAY', label: 'Dushanba' },
  { value: 'TUESDAY', label: 'Seshanba' },
  { value: 'WEDNESDAY', label: 'Chorshanba' },
  { value: 'THURSDAY', label: 'Payshanba' },
  { value: 'FRIDAY', label: 'Juma' },
  { value: 'SATURDAY', label: 'Shanba' },
  { value: 'SUNDAY', label: 'Yakshanba' },
];

const STATUS_OPTIONS: Array<{ value: ScheduleStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Faol' },
  { value: 'PAUSED', label: 'Muzlatilgan' },
  { value: 'CANCELLED', label: 'Bekor qilingan' },
];

export function ScheduleFormModal({ open, onClose, schedule, defaultGroupId }: ScheduleFormModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const branchId = Form.useWatch('branchId', form);
  const isEdit = !!schedule;
  // The group can't be reassigned after the fact (locked in edit mode) or when
  // preselected from a Group's own detail page.
  const groupLocked = isEdit || !!defaultGroupId;

  const groupsQuery = useQuery({ queryKey: ['groups', { pageSize: 100, forScheduleSelect: true }], queryFn: () => listGroups({ pageSize: 100 }), enabled: open });
  // branchId is never picked directly — a schedule always belongs to its group's own
  // branch (backend-enforced), so it's derived from the selected group and shown
  // read-only; branchesQuery only supplies the display name for that disabled field.
  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100, forScheduleSelect: true }], queryFn: () => listBranches({ pageSize: 100 }), enabled: open });
  const classroomsQuery = useQuery({
    queryKey: ['classrooms', { branchId, pageSize: 100, status: 'ACTIVE', forScheduleSelect: true }],
    queryFn: () => listClassrooms({ branchId, pageSize: 100, status: 'ACTIVE' }),
    enabled: open && !!branchId,
  });
  const teachersQuery = useQuery({ queryKey: ['teachers', { pageSize: 100, status: 'ACTIVE', forScheduleSelect: true }], queryFn: () => listTeachers({ pageSize: 100, status: 'ACTIVE' }), enabled: open });

  useEffect(() => {
    if (!open) return;
    if (schedule) {
      form.setFieldsValue({
        groupId: schedule.groupId,
        branchId: schedule.branchId,
        classroomId: schedule.classroomId ?? undefined,
        teacherEmployeeId: schedule.teacherEmployeeId ?? undefined,
        dayOfWeek: schedule.dayOfWeek,
        startTime: dayjs(schedule.startTime, 'HH:mm'),
        endTime: dayjs(schedule.endTime, 'HH:mm'),
        startDate: dayjs(schedule.startDate),
        endDate: schedule.endDate ? dayjs(schedule.endDate) : undefined,
        status: schedule.status,
        notes: schedule.notes ?? undefined,
      });
    } else {
      form.resetFields();
      if (defaultGroupId) {
        form.setFieldValue('groupId', defaultGroupId);
        const group = groupsQuery.data?.items.find((g) => g.id === defaultGroupId);
        if (group) form.setFieldValue('branchId', group.branchId);
      }
    }
    // groupsQuery.data included so a defaultGroupId's branch backfills once the groups list resolves, even if this effect first ran before it loaded.
  }, [open, schedule, defaultGroupId, form, groupsQuery.data]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: SchedulePayload = {
        ...values,
        startTime: values.startTime.format('HH:mm'),
        endTime: values.endTime.format('HH:mm'),
        startDate: values.startDate.format('YYYY-MM-DD'),
        endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : undefined,
      };
      return isEdit ? updateSchedule(schedule!.id, payload) : createSchedule(payload);
    },
    onSuccess: () => {
      message.success(isEdit ? 'Dars jadvali yangilandi' : 'Dars jadvali yaratildi');
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['schedule', schedule!.id] });
      queryClient.invalidateQueries({ queryKey: ['group'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Dars jadvalini saqlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={isEdit ? 'Dars jadvalini tahrirlash' : 'Yangi dars jadvali'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={640}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
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
            }}
          />
        </Form.Item>
        <Form.Item name="branchId" label="Filial" tooltip="Guruhning o'z filialidan olinadi" rules={[{ required: true }]}>
          <Select disabled loading={branchesQuery.isLoading} options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))} />
        </Form.Item>
        <Form.Item name="classroomId" label="Xona">
          <Select
            allowClear
            disabled={!branchId}
            loading={classroomsQuery.isLoading}
            options={classroomsQuery.data?.items.map((c) => ({ value: c.id, label: `${c.name} (${c.roomNumber})` }))}
            placeholder={branchId ? 'Xonani tanlang' : 'Avval guruhni tanlang'}
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
        <Form.Item name="dayOfWeek" label="Hafta kuni" rules={[{ required: true }]}>
          <Select options={DAY_OPTIONS} />
        </Form.Item>
        <Form.Item label="Vaqti" required style={{ marginBottom: 0 }}>
          <Form.Item name="startTime" rules={[{ required: true, message: 'Boshlanish vaqtini kiriting' }]} style={{ display: 'inline-block', width: 'calc(50% - 8px)' }}>
            <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="Boshlanish" />
          </Form.Item>
          <Form.Item
            name="endTime"
            dependencies={['startTime']}
            rules={[
              { required: true, message: 'Tugash vaqtini kiriting' },
              ({ getFieldValue }) => ({
                validator(_, value: dayjs.Dayjs | undefined) {
                  const start = getFieldValue('startTime') as dayjs.Dayjs | undefined;
                  if (!value || !start || value.isAfter(start)) return Promise.resolve();
                  return Promise.reject(new Error('Tugash vaqti boshlanish vaqtidan keyin bo\'lishi kerak'));
                },
              }),
            ]}
            style={{ display: 'inline-block', width: 'calc(50% - 8px)', margin: '0 0 0 16px' }}
          >
            <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="Tugash" />
          </Form.Item>
        </Form.Item>
        <Form.Item name="startDate" label="Boshlanish sanasi" rules={[{ required: true }]} style={{ marginTop: 24 }}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="endDate" label="Tugash sanasi (ixtiyoriy)">
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
