import { useQuery } from '@tanstack/react-query';
import { Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { listAuditLogs, type AuditLogEntry } from '../api/auditLog';
import { formatDateTime } from '../utils/format';

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  DEACTIVATE: 'orange',
  APPROVE: 'cyan',
  REJECT: 'red',
  PAY: 'green',
  CANCEL: 'volcano',
  SUBMIT: 'geekblue',
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
        locale={{ emptyText: 'Yozuvlar yo‘q' }}
        pagination={{
          current: page,
          pageSize,
          total: auditQuery.data?.total,
          onChange: setPage,
          showTotal: (total) => `Jami: ${total}`,
        }}
        columns={[
          { title: 'Vaqt', dataIndex: 'createdAt', width: 160, render: (value: string) => formatDateTime(value) },
          { title: 'Kim', dataIndex: ['actor', 'fullName'], render: (value: string) => value ?? 'tizim' },
          {
            title: 'Amal',
            dataIndex: 'action',
            width: 130,
            render: (action: string) => <Tag color={ACTION_COLORS[action] ?? 'default'}>{action}</Tag>,
          },
          { title: 'Obyekt turi', dataIndex: 'entityType' },
          { title: 'Tavsif', dataIndex: 'description' },
        ]}
      />
    </div>
  );
}
