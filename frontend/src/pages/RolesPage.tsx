import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Checkbox, Drawer, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { createRole, getPermissionCatalog, getRole, listRoles, updateRolePermissions } from '../api/roles';
import { useAuthStore } from '../store/auth.store';
import type { PermissionActionValue, RoleListItem } from '../types';

const ALL_ACTIONS: PermissionActionValue[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT'];

export function RolesPage() {
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createForm] = Form.useForm();

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const catalogQuery = useQuery({ queryKey: ['permission-catalog'], queryFn: getPermissionCatalog });
  const roleDetailQuery = useQuery({
    queryKey: ['role', editingRoleId],
    queryFn: () => getRole(editingRoleId!),
    enabled: !!editingRoleId,
  });

  useEffect(() => {
    if (roleDetailQuery.data) {
      setSelected(new Set(roleDetailQuery.data.rolePermissions.map((rp) => `${rp.permission.module}:${rp.permission.action}`)));
    }
  }, [roleDetailQuery.data]);

  const createMutation = useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      message.success('Rol yaratildi');
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setCreateOpen(false);
      createForm.resetFields();
    },
  });

  const savePermissionsMutation = useMutation({
    mutationFn: () =>
      updateRolePermissions(
        editingRoleId!,
        Array.from(selected).map((key) => {
          const [module, action] = key.split(':');
          return { module, action: action as PermissionActionValue };
        }),
      ),
    onSuccess: () => {
      message.success('Ruxsatlar saqlandi');
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setEditingRoleId(null);
    },
  });

  const canEdit = hasPermission('roles', 'EDIT');
  const canCreate = hasPermission('roles', 'CREATE');

  function toggle(module: string, action: PermissionActionValue) {
    const key = `${module}:${action}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Rollar va ruxsatlar
        </Typography.Title>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Yangi rol
          </Button>
        )}
      </Space>

      <Table<RoleListItem>
        rowKey="id"
        loading={rolesQuery.isLoading}
        dataSource={rolesQuery.data}
        columns={[
          { title: 'Nomi', dataIndex: 'name' },
          { title: 'Tavsif', dataIndex: 'description' },
          { title: 'Foydalanuvchilar', dataIndex: ['_count', 'users'] },
          { title: 'Ruxsatlar', dataIndex: ['_count', 'rolePermissions'] },
          {
            title: 'Tizim roli',
            dataIndex: 'isSystemRole',
            render: (value: boolean) => (value ? <Tag>Tizim</Tag> : null),
          },
          {
            title: 'Amallar',
            render: (_, record) =>
              canEdit && (
                <Button size="small" onClick={() => setEditingRoleId(record.id)}>
                  Ruxsatlarni tahrirlash
                </Button>
              ),
          },
        ]}
      />

      <Modal title="Yangi rol" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} destroyOnHidden>
        <Form form={createForm} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item name="name" label="Nomi" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Tavsif">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`Ruxsatlar: ${rolesQuery.data?.find((r) => r.id === editingRoleId)?.name ?? ''}`}
        open={!!editingRoleId}
        onClose={() => setEditingRoleId(null)}
        size={640}
        extra={
          <Button type="primary" loading={savePermissionsMutation.isPending} onClick={() => savePermissionsMutation.mutate()}>
            Saqlash
          </Button>
        }
      >
        <Table
          rowKey="module"
          loading={roleDetailQuery.isLoading}
          pagination={false}
          dataSource={Object.entries(catalogQuery.data ?? {}).map(([module, actions]) => ({ module, actions }))}
          columns={[
            { title: 'Modul', dataIndex: 'module' },
            ...ALL_ACTIONS.map((action) => ({
              title: action,
              key: action,
              render: (_: unknown, record: { module: string; actions: PermissionActionValue[] }) =>
                record.actions.includes(action) ? (
                  <Checkbox checked={selected.has(`${record.module}:${action}`)} onChange={() => toggle(record.module, action)} />
                ) : null,
            })),
          ]}
        />
      </Drawer>
    </div>
  );
}
