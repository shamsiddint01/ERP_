import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Card, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Select, Tag } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { getGroup, listGroups } from '../api/groups';
import { createEnrollment, type CreateEnrollmentPayload } from '../api/enrollments';
import { listStudents } from '../api/students';

interface EnrollmentFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-select when opened from a Group's own detail page ("Enroll a student"). */
  defaultGroupId?: string;
  /** Pre-select when opened from a Student's own detail page ("Enroll into a group"). */
  defaultStudentId?: string;
}

interface FormValues {
  studentId: string;
  groupId: string;
  startDate?: dayjs.Dayjs;
  endDate?: dayjs.Dayjs;
  agreedTuition?: number;
  discountAmount?: number;
  notes?: string;
}

export function EnrollmentFormModal({ open, onClose, defaultGroupId, defaultStudentId }: EnrollmentFormModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [studentSearch, setStudentSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  // Reactively reads the form's own groupId field instead of mirroring it into separate state.
  const selectedGroupId = Form.useWatch('groupId', form);

  const studentsQuery = useQuery({
    queryKey: ['students', { search: studentSearch || undefined, pageSize: 20, forEnrollSelect: true }],
    queryFn: () => listStudents({ search: studentSearch || undefined, pageSize: 20 }),
    enabled: open,
  });
  // Only PLANNED/ACTIVE groups make sense to enrol into — a COMPLETED/CANCELLED
  // one is rejected server-side anyway (Phase D §25), so don't offer it at all.
  const groupsQuery = useQuery({
    queryKey: ['groups', { search: groupSearch || undefined, pageSize: 20, forEnrollSelect: true }],
    queryFn: () => listGroups({ search: groupSearch || undefined, pageSize: 20 }),
    enabled: open,
  });
  const selectedGroupQuery = useQuery({
    queryKey: ['group', selectedGroupId],
    queryFn: () => getGroup(selectedGroupId!),
    enabled: !!selectedGroupId,
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (defaultGroupId) form.setFieldValue('groupId', defaultGroupId);
    if (defaultStudentId) form.setFieldValue('studentId', defaultStudentId);
  }, [open, defaultGroupId, defaultStudentId, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: CreateEnrollmentPayload = {
        ...values,
        startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : undefined,
        endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : undefined,
      };
      return createEnrollment(payload);
    },
    onSuccess: () => {
      message.success("O'quvchi guruhga yozildi");
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['group'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['student'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Yozib bo'lmadi");
    },
  });

  const groupInfo = selectedGroupQuery.data;

  return (
    <Modal
      title="O'quvchini guruhga yozish"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={600}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="studentId" label="O'quvchi" rules={[{ required: true, message: "O'quvchini tanlang" }]}>
          <Select
            showSearch
            disabled={!!defaultStudentId}
            loading={studentsQuery.isLoading}
            filterOption={false}
            onSearch={setStudentSearch}
            options={studentsQuery.data?.items.map((s) => ({ value: s.id, label: `${s.fullName} (${s.studentCode})` }))}
            placeholder="Ism yoki kod bo'yicha qidiring"
          />
        </Form.Item>
        <Form.Item name="groupId" label="Guruh" rules={[{ required: true, message: 'Guruhni tanlang' }]}>
          <Select
            showSearch
            disabled={!!defaultGroupId}
            loading={groupsQuery.isLoading}
            filterOption={false}
            onSearch={setGroupSearch}
            options={groupsQuery.data?.items.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))}
            placeholder="Nomi yoki kodi bo'yicha qidiring"
          />
        </Form.Item>

        {groupInfo && (
          <Card size="small" style={{ marginBottom: 16 }} loading={selectedGroupQuery.isLoading}>
            <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="Kurs">{groupInfo.course.name}</Descriptions.Item>
              <Descriptions.Item label="O'qituvchi">{groupInfo.teacherEmployee?.fullName ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Filial">{groupInfo.branch.name}</Descriptions.Item>
              <Descriptions.Item label="Xona">{groupInfo.classroom?.name ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Sig'imi">{groupInfo.capacity}</Descriptions.Item>
              <Descriptions.Item label="Bo'sh o'rinlar">
                <Tag color={groupInfo.availableSeats > 0 ? 'green' : 'red'}>{groupInfo.availableSeats}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Standart to'lov" span={2}>
                {groupInfo.tuitionAmount ? Number(groupInfo.tuitionAmount).toLocaleString('uz-UZ') + " so'm" : '—'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        )}

        <Form.Item name="startDate" label="Boshlanish sanasi (ixtiyoriy — bugungi sana olinadi)">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="endDate" label="Tugash sanasi">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="agreedTuition" label="Kelishilgan to'lov (bo'sh qoldirilsa guruh narxi olinadi)">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="discountAmount" label="Chegirma">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="notes" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
