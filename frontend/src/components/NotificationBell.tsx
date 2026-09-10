import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Dropdown, Empty, List, Spin, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { getUnreadCount, listNotifications, markAllNotificationsRead, markNotificationRead } from '../api/notifications';
import type { NotificationItem, NotificationSeverity } from '../types';
import { formatRelativeTime } from '../utils/format';

const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
  INFO: 'blue',
  SUCCESS: 'green',
  WARNING: 'gold',
  CRITICAL: 'red',
};

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
  });

  const recentQuery = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => listNotifications({ page: 1, pageSize: 6 }),
    refetchInterval: 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markOne = useMutation({ mutationFn: markNotificationRead, onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: invalidate });

  function openNotification(item: NotificationItem) {
    if (!item.isRead) markOne.mutate(item.id);
    if (item.actionUrl) navigate(item.actionUrl);
  }

  const unreadCount = unreadQuery.data ?? 0;

  const panel = (
    <div style={{ width: 380, background: '#fff', borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <Typography.Text strong>Bildirishnomalar</Typography.Text>
        <Button
          type="link"
          size="small"
          icon={<CheckOutlined />}
          disabled={unreadCount === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          Hammasini o'qilgan qilish
        </Button>
      </div>

      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {recentQuery.isLoading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : (recentQuery.data?.items.length ?? 0) === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bildirishnomalar yo'q" style={{ padding: 24 }} />
        ) : (
          <List<NotificationItem>
            size="small"
            dataSource={recentQuery.data?.items}
            renderItem={(item) => (
              <List.Item
                onClick={() => openNotification(item)}
                style={{ padding: '10px 14px', cursor: 'pointer', background: item.isRead ? undefined : '#f0f7ff', alignItems: 'flex-start' }}
              >
                <List.Item.Meta
                  title={
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Tag color={SEVERITY_COLOR[item.severity]} style={{ marginInlineEnd: 0 }}>
                        {item.severity}
                      </Tag>
                      <span style={{ fontWeight: item.isRead ? 400 : 600 }}>{item.title}</span>
                    </span>
                  }
                  description={
                    <>
                      <div style={{ fontSize: 12 }}>{item.message}</div>
                      <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{formatRelativeTime(item.createdAt)}</div>
                    </>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>

      <div style={{ borderTop: '1px solid #f0f0f0', padding: '8px 14px', textAlign: 'center' }}>
        <Button type="link" size="small" onClick={() => navigate('/notifications')}>
          Barchasini ko'rish
        </Button>
      </div>
    </div>
  );

  return (
    <Dropdown popupRender={() => panel} trigger={['click']} placement="bottomRight">
      <Badge count={unreadCount} size="small" offset={[-2, 4]}>
        <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label="Bildirishnomalar" />
      </Badge>
    </Dropdown>
  );
}
