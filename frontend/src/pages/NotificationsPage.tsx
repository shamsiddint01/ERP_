import { CheckOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Select, Space, Table, Tag, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from '../api/notifications';
import type { NotificationItem, NotificationSeverity, NotificationType } from '../types';
import { formatDateTime } from '../utils/format';

const { RangePicker } = DatePicker;

const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
  INFO: 'blue',
  SUCCESS: 'green',
  WARNING: 'gold',
  CRITICAL: 'red',
};

const TYPE_LABELS: Record<NotificationType, string> = {
  NEW_ORDER: 'Yangi buyurtma',
  NEW_PAYMENT: 'Yangi to‘lov',
  LOW_STOCK: 'Kam qolgan mahsulot',
  INVOICE_DUE: 'Hisob-faktura muddati',
  DEBT_REMINDER: 'Qarz eslatmasi',
  NEW_EMPLOYEE: 'Yangi xodim',
  SYSTEM_WARNING: 'Tizim ogohlantirishi',
  PAYMENT_DUE: 'To‘lov muddati',
  INVOICE_OVERDUE: 'Muddati o‘tgan hisob-faktura',
  CUSTOMER_BALANCE: 'Mijoz balansi',
  SUPPLIER_BALANCE: 'Yetkazib beruvchi balansi',
  EXPENSE_PENDING: 'Tasdiqlashni kutayotgan xarajat',
  PAYROLL_PENDING: 'Tasdiqlashni kutayotgan ish haqi',
  ATTENDANCE_ALERT: 'Davomat ogohlantirishi',
  SYSTEM: 'Tizim',
  STUDENT_ABSENT: "O'quvchi kelmadi",
  STUDENT_LATE: "O'quvchi kech qoldi",
  STUDENT_REPEATED_ABSENCE: 'Takroriy davomatsizlik',
};

export function NotificationsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [typeFilter, setTypeFilter] = useState<NotificationType | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const query = {
    page,
    pageSize,
    isRead: readFilter === 'all' ? undefined : readFilter === 'read',
    type: typeFilter,
    from: range?.[0]?.startOf('day').toISOString(),
    to: range?.[1]?.endOf('day').toISOString(),
  };

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'list', query],
    queryFn: () => listNotifications(query),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markOne = useMutation({ mutationFn: markNotificationRead, onSuccess: invalidate });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: (result) => {
      message.success(`${result.updated} ta bildirishnoma o'qilgan deb belgilandi`);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => {
      message.success('Bildirishnoma o‘chirildi');
      invalidate();
    },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Bildirishnomalar
        </Typography.Title>
        <Button
          icon={<CheckOutlined />}
          disabled={(notificationsQuery.data?.unreadCount ?? 0) === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          Hammasini o'qilgan qilish
        </Button>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            value={readFilter}
            style={{ width: 160 }}
            onChange={(v) => {
              setReadFilter(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'Barchasi' },
              { value: 'unread', label: "O'qilmagan" },
              { value: 'read', label: "O'qilgan" },
            ]}
          />
          <Select
            allowClear
            placeholder="Turi bo'yicha"
            style={{ width: 260 }}
            value={typeFilter}
            onChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
            options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <RangePicker
            value={range ?? undefined}
            onChange={(v) => {
              setRange(v as [Dayjs | null, Dayjs | null] | null);
              setPage(1);
            }}
          />
        </Space>
      </Card>

      <Table<NotificationItem>
        rowKey="id"
        loading={notificationsQuery.isLoading}
        dataSource={notificationsQuery.data?.items}
        locale={{ emptyText: "Bildirishnomalar yo'q" }}
        rowClassName={(record) => (record.isRead ? '' : 'ant-table-row-selected')}
        pagination={{
          current: page,
          pageSize,
          total: notificationsQuery.data?.total,
          onChange: setPage,
          showTotal: (total) => `Jami: ${total}`,
        }}
        columns={[
          {
            title: 'Daraja',
            dataIndex: 'severity',
            width: 110,
            render: (severity: NotificationSeverity) => <Tag color={SEVERITY_COLOR[severity]}>{severity}</Tag>,
          },
          {
            title: 'Turi',
            dataIndex: 'type',
            width: 200,
            render: (type: NotificationType) => TYPE_LABELS[type] ?? type,
          },
          {
            title: 'Bildirishnoma',
            dataIndex: 'title',
            render: (_: string, record) => (
              <div>
                <div style={{ fontWeight: record.isRead ? 400 : 600 }}>{record.title}</div>
                <div style={{ color: '#666', fontSize: 13 }}>{record.message}</div>
              </div>
            ),
          },
          {
            title: 'Sana',
            dataIndex: 'createdAt',
            width: 160,
            render: (value: string) => formatDateTime(value),
          },
          {
            title: 'Amallar',
            key: 'actions',
            width: 220,
            render: (_: unknown, record) => (
              <Space>
                {record.actionUrl && (
                  <Button
                    size="small"
                    icon={<LinkOutlined />}
                    onClick={() => {
                      if (!record.isRead) markOne.mutate(record.id);
                      navigate(record.actionUrl!);
                    }}
                  >
                    Ochish
                  </Button>
                )}
                {!record.isRead && (
                  <Button size="small" icon={<CheckOutlined />} onClick={() => markOne.mutate(record.id)}>
                    O'qildi
                  </Button>
                )}
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove.mutate(record.id)} />
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
}
