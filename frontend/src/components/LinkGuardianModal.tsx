import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Checkbox, Form, Modal, Select } from 'antd';
import { listGuardians } from '../api/guardians';
import { addStudentGuardian } from '../api/students';
import type { GuardianRelationship } from '../types';

interface LinkGuardianModalProps {
  open: boolean;
  onClose: () => void;
  studentId: string;
  alreadyLinkedGuardianIds: string[];
}

interface FormValues {
  guardianId: string;
  relationship?: GuardianRelationship;
  isPrimary?: boolean;
}

const RELATIONSHIP_OPTIONS: Array<{ value: GuardianRelationship; label: string }> = [
  { value: 'MOTHER', label: 'Ona' },
  { value: 'FATHER', label: 'Ota' },
  { value: 'GRANDPARENT', label: 'Bobo/Buvi' },
  { value: 'SIBLING', label: 'Aka/Uka/Opa/Singil' },
  { value: 'RELATIVE', label: "Qarindosh" },
  { value: 'LEGAL_GUARDIAN', label: "Vasiy" },
  { value: 'OTHER', label: 'Boshqa' },
];

export function LinkGuardianModal({ open, onClose, studentId, alreadyLinkedGuardianIds }: LinkGuardianModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const guardiansQuery = useQuery({
    queryKey: ['guardians', { pageSize: 100, forLinkSelect: true }],
    queryFn: () => listGuardians({ pageSize: 100, status: 'ACTIVE' }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => addStudentGuardian(studentId, values),
    onSuccess: () => {
      message.success("Ota-ona/vasiy o'quvchiga bog'landi");
      queryClient.invalidateQueries({ queryKey: ['student', studentId] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Bog'lab bo'lmadi");
    },
  });

  const availableGuardians = (guardiansQuery.data?.items ?? []).filter((g) => !alreadyLinkedGuardianIds.includes(g.id));

  return (
    <Modal
      title="Ota-ona/vasiyni bog'lash"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="guardianId" label="Ota-ona/vasiy" rules={[{ required: true }]}>
          <Select
            showSearch
            loading={guardiansQuery.isLoading}
            filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
            options={availableGuardians.map((g) => ({ value: g.id, label: `${g.fullName} (${g.phone})` }))}
            placeholder="Qidirish uchun yozing"
          />
        </Form.Item>
        <Form.Item name="relationship" label="Qarindoshlik turi">
          <Select allowClear placeholder="O'quvchi bilan bog'liqlik turi" options={RELATIONSHIP_OPTIONS} />
        </Form.Item>
        <Form.Item name="isPrimary" valuePropName="checked">
          <Checkbox>Asosiy vasiy sifatida belgilash</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}
