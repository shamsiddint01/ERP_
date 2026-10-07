import { LockOutlined } from '@ant-design/icons';
import { Tag, Typography } from 'antd';
import type { LoginAccount } from '../types';
import { PasswordReveal } from './PasswordReveal';

/**
 * "Login" column cell for people lists: the username (with a blocked /
 * inactive tag) and, for admins, the masked password with 👁 / copy under it.
 * A muted dash when the person has no login yet.
 */
export function LoginCell({ user }: { user: { id: string; username: string; status: LoginAccount['status'] } | null }) {
  if (!user) return <Typography.Text type="secondary">—</Typography.Text>;
  return (
    <div>
      <span style={{ whiteSpace: 'nowrap' }}>
        <Typography.Text style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}>{user.username}</Typography.Text>
        {user.status !== 'ACTIVE' && (
          <Tag color={user.status === 'SUSPENDED' ? 'red' : 'default'} icon={<LockOutlined />} style={{ marginInlineStart: 6 }}>
            {user.status === 'SUSPENDED' ? 'Bloklangan' : 'Faol emas'}
          </Tag>
        )}
      </span>
      <div>
        <PasswordReveal userId={user.id} compact />
      </div>
    </div>
  );
}
