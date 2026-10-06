import { KeyOutlined, LockOutlined, StopOutlined, UnlockOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, Modal, Popconfirm, Skeleton, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useAuthStore } from '../store/auth.store';
import type { LoginAccount } from '../types';
import { formatDateTime } from '../utils/format';

function apiError(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(detail) ? detail.join(', ') : (detail ?? fallback);
}

const passwordRules = [
  { required: true, message: 'Parolni kiriting' },
  { min: 8, message: "Kamida 8 ta belgi bo'lsin" },
];

interface LoginAccountCardProps {
  /** Who this login belongs to, e.g. "O'quvchi" / "O'qituvchi" — used in the texts. */
  ownerLabel: string;
  /** Shown while there is no login yet: what the person gets with one. */
  emptyText: string;
  queryKey: readonly unknown[];
  /** The permission needed to create / change the login (the owner record's own EDIT permission). */
  editPermission: { module: string; action: string };
  fetchAccount: () => Promise<LoginAccount | null>;
  createAccount: (payload: { username: string; password: string }) => Promise<unknown>;
  updateAccount: (payload: { password?: string; active?: boolean }) => Promise<unknown>;
}

/**
 * A person's login (student or teacher): staff create it by typing the login
 * and password themselves, set a new password, or block it. The password is
 * only ever stored as a hash, so it is shown nowhere after saving — the
 * staff member hands it over right away and can set a new one any time.
 */
export function LoginAccountCard({ ownerLabel, emptyText, queryKey, editPermission, fetchAccount, createAccount, updateAccount }: LoginAccountCardProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((state) => state.hasPermission(editPermission.module, editPermission.action));
  const [mode, setMode] = useState<'create' | 'password' | null>(null);
  const [form] = Form.useForm<{ username?: string; password: string }>();

  const accountQuery = useQuery({ queryKey, queryFn: fetchAccount });
  const account = accountQuery.data;

  const onDone = (text: string) => {
    message.success(text);
    queryClient.invalidateQueries({ queryKey });
    setMode(null);
  };

  const createMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => onDone(`Login yaratildi — uni ${ownerLabel.toLowerCase()}ga bering`),
    onError: (error) => message.error(apiError(error, "Login yaratib bo'lmadi")),
  });
  const updateMutation = useMutation({
    mutationFn: updateAccount,
    onSuccess: (_data, payload) => onDone(payload.password ? 'Yangi parol saqlandi' : payload.active ? 'Login faollashtirildi' : 'Login bloklandi'),
    onError: (error) => message.error(apiError(error, "Saqlab bo'lmadi")),
  });

  const blocked = account && account.status !== 'ACTIVE';

  return (
    <Card size="small" title="Tizimga kirish (login)" style={{ marginBottom: 16 }}>
      {accountQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 1 }} />
      ) : !account ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Typography.Text type="secondary">{emptyText}</Typography.Text>
          {canEdit && (
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => setMode('create')}>
              Login yaratish
            </Button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Space orientation="vertical" size={2}>
            <Space>
              <Typography.Text strong style={{ fontSize: 15 }}>
                {account.username}
              </Typography.Text>
              {!blocked ? <Tag color="green">Faol</Tag> : account.status === 'SUSPENDED' ? <Tag color="red">Bloklangan</Tag> : <Tag>Faol emas — kira olmaydi</Tag>}
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Oxirgi kirish: {account.lastActiveAt ? formatDateTime(account.lastActiveAt) : 'hali kirmagan'}
            </Typography.Text>
          </Space>
          {canEdit && (
            <Space wrap>
              <Button icon={<KeyOutlined />} onClick={() => setMode('password')}>
                Parolni almashtirish
              </Button>
              {blocked ? (
                <Button icon={<UnlockOutlined />} loading={updateMutation.isPending} onClick={() => updateMutation.mutate({ active: true })}>
                  Faollashtirish
                </Button>
              ) : (
                <Popconfirm title={`Login bloklansinmi? ${ownerLabel} barcha qurilmalardan chiqariladi.`} onConfirm={() => updateMutation.mutate({ active: false })}>
                  <Button danger icon={<StopOutlined />} loading={updateMutation.isPending}>
                    Bloklash
                  </Button>
                </Popconfirm>
              )}
            </Space>
          )}
        </div>
      )}

      <Modal
        title={mode === 'create' ? 'Login yaratish' : 'Yangi parol'}
        open={!!mode}
        onCancel={() => setMode(null)}
        onOk={() => form.submit()}
        okText="Saqlash"
        cancelText="Bekor qilish"
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) =>
            mode === 'create' ? createMutation.mutate({ username: values.username!, password: values.password }) : updateMutation.mutate({ password: values.password })
          }
        >
          {mode === 'create' && (
            <Form.Item
              name="username"
              label="Login"
              extra="Lotin harflari, raqamlar va . _ - belgilari"
              rules={[
                { required: true, message: 'Loginni kiriting' },
                { min: 3, message: "Kamida 3 ta belgi bo'lsin" },
                { pattern: /^[a-zA-Z0-9._-]+$/, message: "Faqat lotin harflari, raqamlar va . _ -" },
              ]}
            >
              <Input placeholder="masalan: aziz.karimov" autoComplete="off" />
            </Form.Item>
          )}
          <Form.Item name="password" label={mode === 'create' ? 'Parol' : 'Yangi parol'} rules={passwordRules} style={{ marginBottom: 0 }} extra="Parolni hozir yozib oling yoki o'zi bilan yuboring — saqlangandan keyin u hech qayerda ko'rsatilmaydi">
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
