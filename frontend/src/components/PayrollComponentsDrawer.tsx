import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Form, Input, InputNumber, List, Popconfirm, Select, Space, Tag } from 'antd';
import { EmptyState } from './EmptyState';
import { createPayrollComponent, deletePayrollComponent, listPayrollComponents } from '../api/payroll';
import type { PayrollComponentType } from '../types';

interface PayrollComponentsDrawerProps {
  open: boolean;
  onClose: () => void;
}

const TYPE_LABELS: Record<PayrollComponentType, string> = { BONUS: 'Bonus', ALLOWANCE: "Qo'shimcha to'lov", DEDUCTION: 'Ushlab qolish' };
const TYPE_COLORS: Record<PayrollComponentType, string> = { BONUS: 'green', ALLOWANCE: 'blue', DEDUCTION: 'red' };

export function PayrollComponentsDrawer({ open, onClose }: PayrollComponentsDrawerProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const componentsQuery = useQuery({ queryKey: ['payroll-components'], queryFn: listPayrollComponents, enabled: open });

  const createMutation = useMutation({
    mutationFn: createPayrollComponent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-components'] });
      form.resetFields();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Yaratib bo‘lmadi');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePayrollComponent,
    onSuccess: () => {
      message.success('O‘chirildi');
      queryClient.invalidateQueries({ queryKey: ['payroll-components'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'O‘chirib bo‘lmadi — allaqachon ishlatilgan bo‘lishi mumkin');
    },
  });

  return (
    <Drawer title="Bonus / qo'shimcha to'lov / ushlab qolish turlari" open={open} onClose={onClose} size={420}>
      <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)} style={{ marginBottom: 16 }}>
        <Form.Item name="name" label="Nomi" rules={[{ required: true, message: 'Nomi kerak' }]}>
          <Input placeholder="Masalan: Transport uchun to'lov" />
        </Form.Item>
        <Form.Item name="type" label="Turi" rules={[{ required: true }]}>
          <Select options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
        </Form.Item>
        <Form.Item name="defaultAmount" label="Standart summa (ixtiyoriy)">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={createMutation.isPending}>
          Qo'shish
        </Button>
      </Form>

      <List
        loading={componentsQuery.isLoading}
        dataSource={componentsQuery.data}
        locale={{ emptyText: <EmptyState title="Hali yaratilmagan" /> }}
        renderItem={(component) => (
          <List.Item
            actions={[
              !component.isSystem && (
                <Popconfirm key="delete" title="O'chirish?" onConfirm={() => deleteMutation.mutate(component.id)}>
                  <Button loading={deleteMutation.isPending} danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
            ]}
          >
            <Space>
              {component.name}
              <Tag color={TYPE_COLORS[component.type]}>{TYPE_LABELS[component.type]}</Tag>
              {!component.isActive && <Tag>Faolsiz</Tag>}
            </Space>
          </List.Item>
        )}
      />
    </Drawer>
  );
}
