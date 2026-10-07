import { KeyOutlined, SearchOutlined, StopOutlined, UnlockOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Input, Modal, Popconfirm, Segmented, Space, Table, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listUsers, resetUserPassword, setUserActive } from '../api/users';
import { useAuthStore } from '../store/auth.store';
import { palette } from '../theme';
import type { IssuedLogin, UserListItem } from '../types';
import { formatDateTime } from '../utils/format';
import { LIVE_REFRESH_MS, PasswordReveal } from './PasswordReveal';

type Kind = 'all' | 'student' | 'teacher' | 'staff';

const kindOf = (u: UserListItem): Exclude<Kind, 'all'> => (u.student ? 'student' : u.employee?.teacherProfile ? 'teacher' : 'staff');

function apiError(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(detail) ? detail.join(', ') : (detail ?? fallback);
}

const monospace = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } as const;

/** Sozlamalar → every login in the system (students, teachers, staff) with its password, for the admin. */
export function AllLoginsCard() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canEdit = hasPermission('users', 'EDIT');
  const [kind, setKind] = useState<Kind>('all');
  const [search, setSearch] = useState('');
  const [issued, setIssued] = useState<IssuedLogin | null>(null);

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: listUsers, refetchInterval: LIVE_REFRESH_MS });

  const resetMutation = useMutation({
    mutationFn: resetUserPassword,
    onSuccess: (login) => {
      queryClient.invalidateQueries({ queryKey: ['credentials', login.id] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIssued(login);
    },
    onError: (error) => message.error(apiError(error, "Parolni almashtirib bo'lmadi")),
  });
  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setUserActive(id, active),
    onSuccess: (_data, { active }) => {
      message.success(active ? 'Login faollashtirildi' : 'Login bloklandi');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => message.error(apiError(error, "Saqlab bo'lmadi")),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (usersQuery.data ?? []).filter(
      (u) => (kind === 'all' || kindOf(u) === kind) && (!term || u.username.toLowerCase().includes(term) || u.fullName.toLowerCase().includes(term)),
    );
  }, [usersQuery.data, kind, search]);

  return (
    <Card title="Loginlar va parollar" style={{ marginTop: 20 }} styles={{ body: { paddingTop: 12 } }}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Tizimdagi barcha loginlar va ularning joriy parollari (har bir necha soniyada o'zi yangilanadi). Parollarni ko'rish audit jurnaliga yoziladi.
      </Typography.Paragraph>
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented<Kind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Hammasi' },
            { value: 'student', label: "O'quvchilar" },
            { value: 'teacher', label: "O'qituvchilar" },
            { value: 'staff', label: 'Xodimlar' },
          ]}
        />
        <Input allowClear prefix={<SearchOutlined />} placeholder="Login yoki ism" style={{ width: 220 }} onChange={(e) => setSearch(e.target.value)} />
      </Space>
      <Table<UserListItem>
        rowKey="id"
        size="small"
        loading={usersQuery.isLoading}
        dataSource={rows}
        pagination={rows.length > 20 ? { pageSize: 20 } : false}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Login', render: (_, u) => <Typography.Text strong copyable={{ text: u.username, tooltips: ['Nusxalash', 'Nusxalandi'] }} style={monospace}>{u.username}</Typography.Text> },
          { title: 'Parol', render: (_, u) => <PasswordReveal userId={u.id} compact defaultShown /> },
          {
            title: 'Ism',
            render: (_, u) =>
              u.student ? (
                <Link to={`/students/${u.student.id}`}>{u.fullName}</Link>
              ) : u.employee?.teacherProfile ? (
                <Link to={`/teachers/${u.employee.teacherProfile.id}`}>{u.fullName}</Link>
              ) : (
                u.fullName
              ),
          },
          {
            title: 'Kim',
            render: (_, u) => {
              const k = kindOf(u);
              return k === 'student' ? <Tag color="blue">O'quvchi</Tag> : k === 'teacher' ? <Tag color="purple">O'qituvchi</Tag> : <Tag>{u.role.name}</Tag>;
            },
          },
          {
            title: 'Holat',
            render: (_, u) => (u.status === 'ACTIVE' ? <Tag color="green">Faol</Tag> : u.status === 'SUSPENDED' ? <Tag color="red">Bloklangan</Tag> : <Tag>Faol emas</Tag>),
          },
          { title: 'Oxirgi kirish', render: (_, u) => (u.lastActiveAt ? formatDateTime(u.lastActiveAt) : '—') },
          {
            title: '',
            render: (_, u) =>
              canEdit && u.username !== 'admin' ? (
                <Space>
                  <Popconfirm title="Yangi parol berilsinmi?" description="Eski parol ishlamay qoladi." onConfirm={() => resetMutation.mutate(u.id)}>
                    <Button size="small" icon={<KeyOutlined />}>
                      Yangi parol
                    </Button>
                  </Popconfirm>
                  {u.status === 'ACTIVE' ? (
                    <Popconfirm title="Login bloklansinmi?" onConfirm={() => activeMutation.mutate({ id: u.id, active: false })}>
                      <Button size="small" danger icon={<StopOutlined />} aria-label="Bloklash" />
                    </Popconfirm>
                  ) : (
                    <Button size="small" icon={<UnlockOutlined />} onClick={() => activeMutation.mutate({ id: u.id, active: true })} aria-label="Faollashtirish" />
                  )}
                </Space>
              ) : null,
          },
        ]}
      />

      <Modal
        title="Yangi parol berildi"
        open={!!issued}
        onCancel={() => setIssued(null)}
        footer={
          <Button type="primary" onClick={() => setIssued(null)}>
            Tayyor
          </Button>
        }
      >
        {issued && (
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: palette.surfaceRaised,
              border: `1px solid ${palette.border}`,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '10px 16px',
              alignItems: 'center',
            }}
          >
            <Typography.Text type="secondary">Login</Typography.Text>
            <Typography.Text strong copyable={{ tooltips: ['Nusxalash', 'Nusxalandi'] }} style={{ ...monospace, fontSize: 20 }}>
              {issued.username}
            </Typography.Text>
            <Typography.Text type="secondary">Parol</Typography.Text>
            <Typography.Text strong copyable={{ tooltips: ['Nusxalash', 'Nusxalandi'] }} style={{ ...monospace, fontSize: 20 }}>
              {issued.password}
            </Typography.Text>
          </div>
        )}
      </Modal>
    </Card>
  );
}
