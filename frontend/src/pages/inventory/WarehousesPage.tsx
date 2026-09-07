import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { createWarehouse, deactivateWarehouse, listWarehouses } from '../../api/warehouses';
import { useAuthStore } from '../../store/auth.store';
import type { Warehouse } from '../../types';

export function WarehousesPage() {
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: listWarehouses });

  const createMutation = useMutation({
    mutationFn: createWarehouse,
    onSuccess: () => {
      message.success('Ombor yaratildi');
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Ombor yaratib bo‘lmadi');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateWarehouse,
    onSuccess: () => {
      message.success('Ombor faolsizlantirildi');
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Amal bajarilmadi');
    },
  });

  const canCreate = hasPermission('inventory', 'CREATE');
  const canEdit = hasPermission('inventory', 'EDIT');

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Omborlar
        </Typography.Title>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Ombor qo'shish
          </Button>
        )}
      </Space>

      <Table<Warehouse>
        rowKey="id"
        loading={warehousesQuery.isLoading}
        dataSource={warehousesQuery.data}
        columns={[
          { title: 'Nomi', dataIndex: 'name' },
          { title: 'Kodi', dataIndex: 'code', render: (v) => v ?? '—' },
          { title: 'Manzil', dataIndex: 'address', render: (v) => v ?? '—' },
          { title: 'Zaxira yozuvlari', dataIndex: ['_count', 'inventoryStocks'] },
          { title: 'Status', dataIndex: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Faol' : 'Nofaol'}</Tag> },
          {
            title: 'Amallar',
            render: (_, record) =>
              canEdit &&
              record.isActive && (
                <Button danger size="small" loading={deactivateMutation.isPending} onClick={() => deactivateMutation.mutate(record.id)}>
                  Faolsizlantirish
                </Button>
              ),
          },
        ]}
      />

      <Modal title="Yangi ombor" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={createMutation.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item name="name" label="Nomi" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="Kodi">
            <Input placeholder="WH-001" />
          </Form.Item>
          <Form.Item name="address" label="Manzil">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
