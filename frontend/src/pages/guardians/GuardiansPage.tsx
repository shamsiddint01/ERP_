import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listGuardians } from '../../api/guardians';
import { GuardianFormModal } from '../../components/GuardianFormModal';
import { useAuthStore } from '../../store/auth.store';
import type { GuardianListItem, GuardianStatus } from '../../types';

const STATUS_COLORS: Record<GuardianStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };
const STATUS_LABELS: Record<GuardianStatus, string> = { ACTIVE: 'Faol', INACTIVE: 'Nofaol' };
const RELATIONSHIP_LABELS: Record<string, string> = {
  MOTHER: 'Ona',
  FATHER: 'Ota',
  GRANDPARENT: 'Bobo/Buvi',
  SIBLING: 'Aka/Uka/Opa/Singil',
  RELATIVE: 'Qarindosh',
  LEGAL_GUARDIAN: 'Vasiy',
  OTHER: 'Boshqa',
};

export function GuardiansPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<GuardianStatus | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const guardiansQuery = useQuery({
    queryKey: ['guardians', { search, status, page }],
    queryFn: () => listGuardians({ search: search || undefined, status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Ota-onalar / Vasiylar
        </Typography.Title>
        {hasPermission('guardians', 'CREATE') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi ota-ona/vasiy
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Qidirish: F.I.Sh., telefon"
          prefix={<SearchOutlined />}
          style={{ width: 260 }}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 180 }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </Space>

      <Table<GuardianListItem>
        rowKey="id"
        loading={guardiansQuery.isLoading}
        dataSource={guardiansQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/guardians/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: guardiansQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'F.I.Sh.', dataIndex: 'fullName' },
          { title: 'Telefon', dataIndex: 'phone' },
          { title: 'Email', dataIndex: 'email', render: (v: string | null) => v ?? '—' },
          { title: 'Qarindoshlik', dataIndex: 'relationshipType', render: (v: string) => RELATIONSHIP_LABELS[v] ?? v },
          { title: "Bog'langan o'quvchilar", render: (_, record) => record._count.students },
          { title: 'Status', dataIndex: 'status', render: (v: GuardianStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
        ]}
      />

      <GuardianFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
