import { useQuery } from '@tanstack/react-query';
import { Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { listAuditLogs, type AuditLogEntry } from '../api/auditLog';

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  DEACTIVATE: 'orange',
};

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const auditQuery = useQuery({ queryKey: ['audit-logs', page], queryFn: () => listAuditLogs(page, pageSize) });

  return (
    <div>
      <Typography.Title level={4}>Audit jurnali</Typography.Title>
      <Table<AuditLogEntry>
        rowKey="id"
        loading={auditQuery.isLoading}
        dataSource={auditQuery.data?.items}
        pagination={{
          current: page,
          pageSize,
          total: auditQuery.data?.total,
          onChange: setPage,
        }}
        columns={[
          { title: 'Vaqt', dataIndex: 'createdAt', render: (value: string) => new Date(value).toLocaleString('uz-UZ') },
          { title: 'Kim', dataIndex: ['actor', 'fullName'], render: (value: string) => value ?? 'tizim' },
          {
            title: 'Amal',
            dataIndex: 'action',
            render: (action: string) => <Tag color={ACTION_COLORS[action] ?? 'default'}>{action}</Tag>,
          },
          { title: 'Obyekt turi', dataIndex: 'entityType' },
          { title: 'Tavsif', dataIndex: 'description' },
        ]}
      />
    </div>
  );
}
