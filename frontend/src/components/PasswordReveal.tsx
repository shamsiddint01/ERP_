import { CopyOutlined, EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { App, Button, Space, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import { getUserCredentials } from '../api/users';
import { useAuthStore } from '../store/auth.store';

/** How often a shown password / login list re-checks the server, so the admin sees changes without reloading. */
export const LIVE_REFRESH_MS = 5_000;

/**
 * Admin-only password look-up for one login: fetched only when shown (each
 * look-up is audited server-side), with a copy button. Lists keep it masked
 * until the eye is clicked; a person's own page shows it straight away
 * (`defaultShown`). Renders nothing for anyone without `credentials:VIEW`.
 */
export function PasswordReveal({ userId, compact = false, defaultShown = false }: { userId: string; compact?: boolean; defaultShown?: boolean }) {
  const { message } = App.useApp();
  const canView = useAuthStore((state) => state.hasPermission('credentials', 'VIEW'));
  const [shown, setShown] = useState(defaultShown);

  const credentialsQuery = useQuery({
    queryKey: ['credentials', userId],
    queryFn: () => getUserCredentials(userId),
    enabled: canView && shown,
    // Live: while shown, a password changed elsewhere (self-service or by another admin) appears within seconds.
    refetchInterval: shown ? LIVE_REFRESH_MS : false,
  });

  if (!canView) return null;

  const password = credentialsQuery.data?.password;
  const toggle = (
    <Tooltip title={shown ? 'Yashirish' : "Parolni ko'rsatish"}>
      <Button
        type="text"
        size="small"
        icon={shown ? <EyeInvisibleOutlined /> : <EyeOutlined />}
        loading={shown && credentialsQuery.isLoading}
        onClick={(e) => {
          e.stopPropagation();
          setShown((value) => !value);
        }}
        aria-label={shown ? 'Parolni yashirish' : "Parolni ko'rsatish"}
      />
    </Tooltip>
  );

  return (
    <Space size={2} onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
      {!shown || credentialsQuery.isLoading ? (
        <Typography.Text type="secondary" style={{ letterSpacing: 2 }}>
          ••••••••
        </Typography.Text>
      ) : credentialsQuery.isError ? (
        <Typography.Text type="danger">Xato</Typography.Text>
      ) : password ? (
        <Typography.Text strong={!compact} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: compact ? 13 : 16 }}>
          {password}
        </Typography.Text>
      ) : (
        <Tooltip title="Bu login eski usulda yaratilgan, paroli saqlanmagan. Yangi parol bering — keyin u doim ko'rinadi.">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Saqlanmagan
          </Typography.Text>
        </Tooltip>
      )}
      {toggle}
      {shown && password && (
        <Tooltip title="Nusxalash">
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard
                .writeText(password)
                .then(() => message.success('Parol nusxalandi'))
                .catch(() => message.error("Nusxalab bo'lmadi"));
            }}
            aria-label="Parolni nusxalash"
          />
        </Tooltip>
      )}
    </Space>
  );
}
