import { useQuery } from '@tanstack/react-query';
import { Input, Select, Table, Tag } from 'antd';
import { useState } from 'react';
import { listAuditLogs, type AuditLogEntry } from '../api/auditLog';
import { listUsers } from '../api/users';
import { FilterBar } from '../components/FilterBar';
import { PageErrorState } from '../components/PageErrorState';
import { PageHeader } from '../components/PageHeader';
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
  const [entityType, setEntityType] = useState('');
  const [actorUserId, setActorUserId] = useState<string | undefined>();
  const pageSize = 25;
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const auditQuery = useQuery({
    queryKey: ['audit-logs', page, entityType, actorUserId],
    queryFn: () => listAuditLogs(page, pageSize, { entityType: entityType || undefined, actorUserId }),
  });

  if (auditQuery.isError && !auditQuery.data) {
    return <PageErrorState onRetry={() => auditQuery.refetch()} />;
  }

  return (
    <div>
      <PageHeader title="Audit jurnali" />

      <FilterBar>
        <Input
          placeholder="Obyekt turi (masalan: Lesson, Exam)"
          allowClear
          style={{ width: 220 }}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Kim"
          allowClear
          showSearch
          style={{ width: 220 }}
          options={usersQuery.data?.map((u) => ({ value: u.id, label: u.fullName }))}
          filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
          onChange={(value) => {
            setActorUserId(value);
            setPage(1);
          }}
        />
      </FilterBar>

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
