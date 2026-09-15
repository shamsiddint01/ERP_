import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Card, Descriptions, Form, Modal, Select, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGroup, listGroups } from '../api/groups';
import { transferEnrollment } from '../api/enrollments';

interface TransferEnrollmentModalProps {
  open: boolean;
  onClose: () => void;
  /** Only what this modal actually displays — deliberately narrower than EnrollmentDetail so callers with a slimmer local shape (e.g. a student's own embedded enrollment list) don't need to pad it out. */
  enrollment: { id: string; groupId: string; student: { fullName: string }; group: { name: string } };
}

interface FormValues {
  targetGroupId: string;
}

export function TransferEnrollmentModal({ open, onClose, enrollment }: TransferEnrollmentModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();
  const [groupSearch, setGroupSearch] = useState('');
  const targetGroupId = Form.useWatch('targetGroupId', form);

  const groupsQuery = useQuery({
    queryKey: ['groups', { search: groupSearch || undefined, pageSize: 20, forTransferSelect: true }],
    queryFn: () => listGroups({ search: groupSearch || undefined, pageSize: 20 }),
    enabled: open,
  });
  const targetGroupQuery = useQuery({ queryKey: ['group', targetGroupId], queryFn: () => getGroup(targetGroupId!), enabled: !!targetGroupId });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => transferEnrollment(enrollment.id, values),
    onSuccess: (result) => {
      message.success("O'quvchi boshqa guruhga ko'chirildi");
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['enrollment'] });
      queryClient.invalidateQueries({ queryKey: ['group'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['student'] });
      form.resetFields();
      onClose();
      navigate(`/enrollments/${result.transferredTo.id}`);
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Ko'chirib bo'lmadi");
    },
  });

  const targetGroup = targetGroupQuery.data;
  const availableGroups = (groupsQuery.data?.items ?? []).filter((g) => g.id !== enrollment.groupId);

  return (
    <Modal
      title="Boshqa guruhga ko'chirish"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      okText="Ko'chirish"
    >
      <Typography.Paragraph type="secondary">
        <strong>{enrollment.student.fullName}</strong> hozir <strong>{enrollment.group.name}</strong> guruhida. Quyida yangi guruhni tanlang —
        joriy yozilish "ko'chirilgan" statusiga o'tadi va tanlangan guruhda yangi faol yozilish yaratiladi.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="targetGroupId" label="Yangi guruh" rules={[{ required: true, message: 'Guruhni tanlang' }]}>
          <Select
            showSearch
            loading={groupsQuery.isLoading}
            filterOption={false}
            onSearch={setGroupSearch}
            options={availableGroups.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))}
            placeholder="Nomi yoki kodi bo'yicha qidiring"
          />
        </Form.Item>
        {targetGroup && (
          <Card size="small" loading={targetGroupQuery.isLoading}>
            <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="Kurs">{targetGroup.course.name}</Descriptions.Item>
              <Descriptions.Item label="O'qituvchi">{targetGroup.teacherEmployee?.fullName ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Filial">{targetGroup.branch.name}</Descriptions.Item>
              <Descriptions.Item label="Bo'sh o'rinlar">
                <Tag color={targetGroup.availableSeats > 0 ? 'green' : 'red'}>{targetGroup.availableSeats}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        )}
      </Form>
    </Modal>
  );
}
