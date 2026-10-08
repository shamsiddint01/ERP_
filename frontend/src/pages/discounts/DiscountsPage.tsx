import { EditOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { createDiscount, deactivateDiscount, listDiscounts, updateDiscount } from '../../api/discounts';
import { useAuthStore } from '../../store/auth.store';
import type { Discount, DiscountType } from '../../types';

const TYPE_LABELS: Record<DiscountType, string> = {
  PERCENTAGE: 'Foiz (%)',
  FIXED: 'Qat\'iy summa',
  SIBLING: 'Aka-uka/opa-singil',
  SCHOLARSHIP: 'Stipendiya',
  PROMOTIONAL: 'Aksiya',
  CUSTOM: 'Boshqa',
};

interface FormValues {
  name: string;
  type: DiscountType;
  value: number;
  description?: string;
}

export function DiscountsPage() {
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const discountsQuery = useQuery({
    queryKey: ['discounts', { showInactive }],
    queryFn: () => listDiscounts({ isActive: showInactive ? undefined : true, pageSize: 100 }),
  });

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => (editing ? updateDiscount(editing.id, values) : createDiscount(values)),
    onSuccess: () => {
      message.success('Saqlandi');
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      queryClient.invalidateQueries({ queryKey: ['discounts-lookup'] });
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Saqlab bo'lmadi");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateDiscount,
    onSuccess: () => {
      message.success('Nofaol qilindi');
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
    },
  });

  const canManage = hasPermission('discounts', 'CREATE') || hasPermission('discounts', 'EDIT');
  const canDeactivate = hasPermission('discounts', 'DELETE');

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Chegirmalar katalogi
        </Typography.Title>
        {hasPermission('discounts', 'CREATE') && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              form.resetFields();
              setModalOpen(true);
            }}
          >
            Yangi chegirma
          </Button>
        )}
      </Space>

      <Space wrap style={{ marginBottom: 16 }} className="filter-strip">
        <Select
          value={showInactive}
          style={{ width: 220 }}
          options={[
            { value: false, label: 'Faqat faol chegirmalar' },
            { value: true, label: 'Barchasi (nofaollar bilan)' },
          ]}
          onChange={setShowInactive}
        />
      </Space>

      <Table<Discount>
        rowKey="id"
        loading={discountsQuery.isLoading}
        dataSource={discountsQuery.data?.items}
        pagination={false}
        columns={[
          { title: 'Nomi', dataIndex: 'name' },
          { title: 'Turi', dataIndex: 'type', render: (v: DiscountType) => TYPE_LABELS[v] },
          { title: 'Qiymati', dataIndex: 'value', render: (v: string, record) => (record.type === 'PERCENTAGE' ? `${Number(v)}%` : Number(v).toLocaleString('uz-UZ')) },
          { title: 'Izoh', responsive: ['md'], dataIndex: 'description' },
          { title: 'Status', dataIndex: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Faol' : 'Nofaol'}</Tag> },
          {
            title: 'Amallar',
            render: (_, record) =>
              canManage && (
                <Space>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditing(record);
                      form.setFieldsValue({ name: record.name, type: record.type, value: Number(record.value), description: record.description ?? undefined });
                      setModalOpen(true);
                    }}
                  />
                  {canDeactivate && record.isActive && (
                    <Popconfirm title="Chegirmani nofaol qilish?" onConfirm={() => deactivateMutation.mutate(record.id)}>
                      <Button loading={deactivateMutation.isPending} size="small" danger icon={<StopOutlined />} />
                    </Popconfirm>
                  )}
                </Space>
              ),
          },
        ]}
      />

      <Modal
        title={editing ? 'Chegirmani tahrirlash' : 'Yangi chegirma'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="name" label="Nomi" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="Turi" rules={[{ required: true }]}>
            <Select options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="value" label="Qiymati (foiz turi uchun 100 dan oshmasligi kerak)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="Izoh">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
