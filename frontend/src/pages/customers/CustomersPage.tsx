import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { SorterResult } from 'antd/es/table/interface';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCustomer, deactivateCustomer, listCustomers } from '../../api/customers';
import { useAuthStore } from '../../store/auth.store';
import type { CustomerListItem, CustomerStatus } from '../../types';

const STATUS_COLORS: Record<CustomerStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };

export function CustomersPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatus | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | undefined>();

  const customersQuery = useQuery({
    queryKey: ['customers', { search, status, page, pageSize, sortBy, sortDir }],
    queryFn: () => listCustomers({ search: search || undefined, status, page, pageSize, sortBy, sortDir }),
    placeholderData: (prev) => prev,
  });

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      message.success('Mijoz yaratildi');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: () => message.error('Mijoz yaratib bo‘lmadi'),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateCustomer,
    onSuccess: () => {
      message.success('Mijoz deaktivatsiya qilindi');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Deaktivatsiya qilib bo‘lmadi');
    },
  });

  const canCreate = hasPermission('customers', 'CREATE');
  const canDelete = hasPermission('customers', 'DELETE');

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Mijozlar
        </Typography.Title>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Mijoz qo'shish
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="Qidirish: ism, kompaniya, telefon, email"
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

      <Table<CustomerListItem>
        rowKey="id"
        loading={customersQuery.isLoading}
        dataSource={customersQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/customers/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{
          current: page,
          pageSize,
          total: customersQuery.data?.total,
          showSizeChanger: true,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          },
        }}
        onChange={(_, __, sorter) => {
          const s = sorter as SorterResult<CustomerListItem>;
          if (s.field && s.order) {
            setSortBy(String(s.field));
            setSortDir(s.order === 'ascend' ? 'asc' : 'desc');
          } else {
            setSortBy(undefined);
            setSortDir(undefined);
          }
        }}
        columns={[
          {
            title: 'Mijoz',
            dataIndex: 'name',
            sorter: true,
            render: (_, record) => (
              <div>
                <div>{record.name}</div>
                {record.companyName && <Typography.Text type="secondary">{record.companyName}</Typography.Text>}
              </div>
            ),
          },
          {
            title: 'Kontakt',
            render: (_, record) => (
              <div>
                <div>{record.phone}</div>
                {record.email && <Typography.Text type="secondary">{record.email}</Typography.Text>}
              </div>
            ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (value: CustomerStatus) => <Tag color={STATUS_COLORS[value]}>{value === 'ACTIVE' ? 'Faol' : 'Nofaol'}</Tag>,
          },
          {
            title: 'Balans',
            dataIndex: 'balance',
            sorter: true,
            render: (value: string) => Number(value).toLocaleString('uz-UZ'),
          },
          { title: 'Buyurtmalar', dataIndex: ['_count', 'orders'] },
          {
            title: 'Yaratilgan',
            dataIndex: 'createdAt',
            sorter: true,
            render: (value: string) => new Date(value).toLocaleDateString('uz-UZ'),
          },
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

      <Modal title="Yangi mijoz" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={createMutation.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item name="name" label="F.I.O / Mijoz nomi" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="companyName" label="Kompaniya">
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
