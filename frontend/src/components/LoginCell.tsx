import { LockOutlined } from '@ant-design/icons';
import { Tag, Typography } from 'antd';
import type { LoginAccount } from '../types';

/** "Login" column cell for people lists: the username, a "blocked" tag, or a muted dash when no login exists. */
export function LoginCell({ user }: { user: { username: string; status: LoginAccount['status'] } | null }) {
  if (!user) return <Typography.Text type="secondary">—</Typography.Text>;
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <Typography.Text style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}>{user.username}</Typography.Text>
      {user.status !== 'ACTIVE' && (
        <Tag color={user.status === 'SUSPENDED' ? 'red' : 'default'} icon={<LockOutlined />} style={{ marginInlineStart: 6 }}>
          {user.status === 'SUSPENDED' ? 'Bloklangan' : 'Faol emas'}
        </Tag>
      )}
    </span>
  );
}
