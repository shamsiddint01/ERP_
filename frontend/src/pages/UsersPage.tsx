import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { createUser, deactivateUser, listUsers } from '../api/users';
import { listRoles } from '../api/roles';
import { useAuthStore } from '../store/auth.store';
import type { UserListItem } from '../types';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'default',
  SUSPENDED: 'red',
  PENDING_INVITE: 'gold',
};

export function UsersPage() {
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      message.success('Foydalanuvchi yaratildi');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: () => message.error('Foydalanuvchi yaratib bo‘lmadi'),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => {
      message.success('Foydalanuvchi deaktivatsiya qilindi');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const canCreate = hasPermission('users', 'CREATE');
  const canDelete = hasPermission('users', 'DELETE');

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Foydalanuvchilar
        </Typography.Title>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi foydalanuvchi
          </Button>
        )}
      </Space>

      <Table<UserListItem>
        rowKey="id"
        loading={usersQuery.isLoading}
        dataSource={usersQuery.data}
        columns={[
          { title: 'F.I.O', dataIndex: 'fullName' },
          { title: 'Login', dataIndex: 'username' },
          { title: 'Email', dataIndex: 'email' },
          { title: 'Rol', dataIndex: ['role', 'name'] },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (status: string) => <Tag color={STATUS_COLORS[status]}>{status}</Tag>,
          },
          {
            title: 'Amallar',
            render: (_, record) =>
              canDelete &&
              record.status !== 'INACTIVE' && (
                <Button danger size="small" loading={deactivateMutation.isPending} onClick={() => deactivateMutation.mutate(record.id)}>
                  Deaktivatsiya
                </Button>
              ),
          },
        ]}
      />

      <Modal
        title="Yangi foydalanuvchi"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item name="fullName" label="F.I.O" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="username" label="Login" rules={[{ required: true, min: 3 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Telefon">
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Parol" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="roleId" label="Rol" rules={[{ required: true }]}>
            <Select options={rolesQuery.data?.map((role) => ({ label: role.name, value: role.id }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
