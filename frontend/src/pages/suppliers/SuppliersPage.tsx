import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSupplier, deactivateSupplier, listSuppliers } from '../../api/suppliers';
import { useAuthStore } from '../../store/auth.store';
import type { SupplierListItem, SupplierStatus } from '../../types';

const STATUS_COLORS: Record<SupplierStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };

export function SuppliersPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SupplierStatus | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', { search, status, page, pageSize }],
    queryFn: () => listSuppliers({ search: search || undefined, status, page, pageSize }),
    placeholderData: (prev) => prev,
  });

  const createMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      message.success('Yetkazib beruvchi yaratildi');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: () => message.error('Yaratib bo‘lmadi'),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateSupplier,
    onSuccess: () => {
      message.success('Yetkazib beruvchi deaktivatsiya qilindi');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Deaktivatsiya qilib bo‘lmadi');
    },
  });

  const canCreate = hasPermission('suppliers', 'CREATE');
  const canDelete = hasPermission('suppliers', 'DELETE');

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Yetkazib beruvchilar
        </Typography.Title>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yetkazib beruvchi qo'shish
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="Qidirish: kompaniya, kontakt, telefon"
          prefix={<SearchOutlined />}
          style={{ width: 320 }}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 160 }}
          options={[
            { label: 'Faol', value: 'ACTIVE' },
            { label: 'Nofaol', value: 'INACTIVE' },
          ]}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </Space>

      <Table<SupplierListItem>
        rowKey="id"
        loading={suppliersQuery.isLoading}
        dataSource={suppliersQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/suppliers/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{
          current: page,
          pageSize,
          total: suppliersQuery.data?.total,
          showSizeChanger: true,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          },
        }}
        columns={[
          { title: 'Kompaniya', dataIndex: 'companyName' },
          { title: 'Kontakt shaxs', dataIndex: 'contactPerson' },
          { title: 'Telefon', dataIndex: 'phone' },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (value: SupplierStatus) => <Tag color={STATUS_COLORS[value]}>{value === 'ACTIVE' ? 'Faol' : 'Nofaol'}</Tag>,
          },
          { title: 'Qarzdorlik', dataIndex: 'balance', render: (value: string) => Number(value).toLocaleString('uz-UZ') },
          { title: 'Xaridlar', dataIndex: ['_count', 'purchaseOrders'] },
          {
            title: 'Amallar',
            render: (_, record) =>
              canDelete &&
              record.status === 'ACTIVE' && (
                <Button
                  danger
                  size="small"
                  loading={deactivateMutation.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    deactivateMutation.mutate(record.id);
                  }}
                >
                  Deaktivatsiya
                </Button>
              ),
          },
        ]}
      />

      <Modal
        title="Yangi yetkazib beruvchi"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item name="companyName" label="Kompaniya nomi" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contactPerson" label="Kontakt shaxs" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Telefon" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Manzil">
            <Input />
          </Form.Item>
          <Form.Item name="notes" label="Izoh">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
