import { DeleteOutlined, KeyOutlined, StopOutlined, UnlockOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Modal, Popconfirm, Skeleton, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useAuthStore } from '../store/auth.store';
import { palette } from '../theme';
import type { IssuedLogin, LoginAccount } from '../types';
import { formatDateTime } from '../utils/format';
import { LIVE_REFRESH_MS, PasswordReveal } from './PasswordReveal';

function apiError(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(detail) ? detail.join(', ') : (detail ?? fallback);
}

interface LoginAccountCardProps {
  /** Who this login belongs to, e.g. "O'quvchi" / "O'qituvchi" — used in the texts. */
  ownerLabel: string;
  /** Shown while there is no login yet: what the person gets with one. */
  emptyText: string;
  queryKey: readonly unknown[];
  /** The permission needed to create / change the login (the owner record's own EDIT permission). */
  editPermission: { module: string; action: string };
  fetchAccount: () => Promise<LoginAccount | null>;
  createAccount: () => Promise<IssuedLogin>;
  resetPassword: () => Promise<IssuedLogin>;
  setActive: (active: boolean) => Promise<unknown>;
  deleteAccount: () => Promise<unknown>;
}

const monospace = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } as const;

/**
 * A person's login (student or teacher). The system assigns both parts — the
 * login is the next number from 10000, the password is random — and shows
 * them once right after creating / resetting so they can be handed over. An
 * admin (credentials:VIEW) sees the current password here at any time, in
 * case the person loses it.
 */
export function LoginAccountCard({ ownerLabel, emptyText, queryKey, editPermission, fetchAccount, createAccount, resetPassword, setActive, deleteAccount }: LoginAccountCardProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((state) => state.hasPermission(editPermission.module, editPermission.action));
  const canViewPassword = useAuthStore((state) => state.hasPermission('credentials', 'VIEW'));
  const [issued, setIssued] = useState<{ title: string; login: IssuedLogin } | null>(null);

  const accountQuery = useQuery({ queryKey, queryFn: fetchAccount, refetchInterval: LIVE_REFRESH_MS });
  const account = accountQuery.data;

  const refresh = (userId?: string) => {
    queryClient.invalidateQueries({ queryKey });
    if (userId) queryClient.invalidateQueries({ queryKey: ['credentials', userId] });
  };

  const createMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: (login) => {
      refresh(login.id);
      setIssued({ title: 'Login yaratildi', login });
    },
    onError: (error) => message.error(apiError(error, "Login yaratib bo'lmadi")),
  });
  const resetMutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: (login) => {
      refresh(login.id);
      setIssued({ title: 'Yangi parol berildi', login });
    },
    onError: (error) => message.error(apiError(error, "Parolni almashtirib bo'lmadi")),
  });
  const activeMutation = useMutation({
    mutationFn: setActive,
    onSuccess: (_data, active) => {
      message.success(active ? 'Login faollashtirildi' : 'Login bloklandi');
      refresh(account?.id);
    },
    onError: (error) => message.error(apiError(error, "Saqlab bo'lmadi")),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      message.success("Login o'chirildi");
      refresh(account?.id);
    },
    onError: (error) => message.error(apiError(error, "Loginni o'chirib bo'lmadi")),
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
            <Popconfirm title="Login yaratilsinmi?" description="Login raqami va parol avtomatik beriladi." onConfirm={() => createMutation.mutate()}>
              <Button type="primary" icon={<UserAddOutlined />} loading={createMutation.isPending}>
                Login yaratish
              </Button>
            </Popconfirm>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Space orientation="vertical" size={4}>
            <Space wrap>
              <Typography.Text type="secondary" style={{ width: 44, display: 'inline-block' }}>
                Login
              </Typography.Text>
              <Typography.Text strong copyable={{ text: account.username, tooltips: ['Nusxalash', 'Nusxalandi'] }} style={{ ...monospace, fontSize: 16 }}>
                {account.username}
              </Typography.Text>
              {!blocked ? <Tag color="green">Faol</Tag> : account.status === 'SUSPENDED' ? <Tag color="red">Bloklangan</Tag> : <Tag>Faol emas — kira olmaydi</Tag>}
            </Space>
            {canViewPassword && (
              <Space>
                <Typography.Text type="secondary" style={{ width: 44, display: 'inline-block' }}>
                  Parol
                </Typography.Text>
                <PasswordReveal userId={account.id} defaultShown />
              </Space>
            )}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Oxirgi kirish: {account.lastActiveAt ? formatDateTime(account.lastActiveAt) : 'hali kirmagan'}
            </Typography.Text>
          </Space>
          {canEdit && (
            <Space wrap>
              <Popconfirm
                title="Yangi parol berilsinmi?"
                description={`Eski parol ishlamay qoladi va ${ownerLabel.toLowerCase()} barcha qurilmalardan chiqariladi.`}
                onConfirm={() => resetMutation.mutate()}
              >
                <Button icon={<KeyOutlined />} loading={resetMutation.isPending}>
                  Yangi parol
                </Button>
              </Popconfirm>
              {blocked ? (
                <Button icon={<UnlockOutlined />} loading={activeMutation.isPending} onClick={() => activeMutation.mutate(true)}>
                  Faollashtirish
                </Button>
              ) : (
                <Popconfirm title={`Login bloklansinmi? ${ownerLabel} barcha qurilmalardan chiqariladi.`} onConfirm={() => activeMutation.mutate(false)}>
                  <Button danger icon={<StopOutlined />} loading={activeMutation.isPending}>
                    Bloklash
                  </Button>
                </Popconfirm>
              )}
              <Popconfirm
                title="Login o'chirilsinmi?"
                description={`${ownerLabel}ning o'zi va ma'lumotlari qoladi — keyin yangi login berish mumkin.`}
                onConfirm={() => deleteMutation.mutate()}
              >
                <Button danger type="text" icon={<DeleteOutlined />} loading={deleteMutation.isPending} aria-label="Loginni o'chirish" />
              </Popconfirm>
            </Space>
          )}
        </div>
      )}

      <Modal
        title={issued?.title}
        open={!!issued}
        onCancel={() => setIssued(null)}
        footer={
          <Button type="primary" onClick={() => setIssued(null)}>
            Tayyor
          </Button>
        }
      >
        {issued && (
          <>
            <Typography.Paragraph type="secondary">Ushbu ma'lumotlarni {ownerLabel.toLowerCase()}ga bering:</Typography.Paragraph>
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
                {issued.login.username}
              </Typography.Text>
              <Typography.Text type="secondary">Parol</Typography.Text>
              <Typography.Text strong copyable={{ tooltips: ['Nusxalash', 'Nusxalandi'] }} style={{ ...monospace, fontSize: 20 }}>
                {issued.login.password}
              </Typography.Text>
            </div>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
              {canViewPassword
                ? "Unutib qo'ysa — admin uni shu sahifada istalgan vaqtda ko'ra oladi."
                : "Hozir yozib oling: bu oynani yopgandan keyin parolni faqat admin ko'ra oladi."}
            </Typography.Paragraph>
          </>
        )}
      </Modal>
    </Card>
  );
}
