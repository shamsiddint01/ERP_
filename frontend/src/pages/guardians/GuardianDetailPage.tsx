import { ArrowLeftOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Popconfirm, Row, Space, Spin, Table, Tag, Typography } from 'antd';
import { EmptyState } from '../../components/EmptyState';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deactivateGuardian, getGuardian } from '../../api/guardians';
import { removeStudentGuardian } from '../../api/students';
import { GuardianFormModal } from '../../components/GuardianFormModal';
import { PageErrorState } from '../../components/PageErrorState';
import { useAuthStore } from '../../store/auth.store';
import type { GuardianStatus, StudentStatus } from '../../types';

const STATUS_COLORS: Record<GuardianStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };
const STATUS_LABELS: Record<GuardianStatus, string> = { ACTIVE: 'Faol', INACTIVE: 'Nofaol' };
const STUDENT_STATUS_COLORS: Record<StudentStatus, string> = { ACTIVE: 'green', PAUSED: 'gold', GRADUATED: 'blue', INACTIVE: 'default', LEFT: 'red' };
const RELATIONSHIP_LABELS: Record<string, string> = {
  MOTHER: 'Ona',
  FATHER: 'Ota',
  GRANDPARENT: 'Bobo/Buvi',
  SIBLING: 'Aka/Uka/Opa/Singil',
  RELATIVE: 'Qarindosh',
  LEGAL_GUARDIAN: 'Vasiy',
  OTHER: 'Boshqa',
};

export function GuardianDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [editOpen, setEditOpen] = useState(false);

  const guardianQuery = useQuery({ queryKey: ['guardian', id], queryFn: () => getGuardian(id!), enabled: !!id });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['guardian', id] });
    queryClient.invalidateQueries({ queryKey: ['guardians'] });
  }

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateGuardian(id!),
    onSuccess: () => {
      message.success('Nofaol qilindi');
      invalidate();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Amalni bajarib bo‘lmadi');
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (studentId: string) => removeStudentGuardian(studentId, id!),
    onSuccess: () => {
      message.success("Bog'lanish bekor qilindi");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Bog‘lanishni bekor qilib bo‘lmadi');
    },
  });

  if (guardianQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (guardianQuery.isError) {
    return <PageErrorState onRetry={() => guardianQuery.refetch()} />;
  }

  const guardian = guardianQuery.data;
  if (!guardian) return null;

  const canEdit = hasPermission('guardians', 'EDIT');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/guardians')} style={{ marginBottom: 8 }}>
        Ro'yxatga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {guardian.fullName}
            </Typography.Title>
            <Typography.Text type="secondary">{RELATIONSHIP_LABELS[guardian.relationshipType] ?? guardian.relationshipType}</Typography.Text>
          </Col>
          <Col>
            <Space>
              <Tag color={STATUS_COLORS[guardian.status]}>{STATUS_LABELS[guardian.status]}</Tag>
              {canEdit && (
                <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                  Tahrirlash
                </Button>
              )}
              {canEdit && guardian.status !== 'INACTIVE' && (
                <Popconfirm title="Nofaol qilishni tasdiqlaysizmi?" onConfirm={() => deactivateMutation.mutate()}>
                  <Button loading={deactivateMutation.isPending} danger icon={<StopOutlined />}>
                    Nofaol qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>

        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }}>
          <Descriptions.Item label="Telefon">{guardian.phone}</Descriptions.Item>
          <Descriptions.Item label="Email">{guardian.email ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Manzil">{guardian.address ?? '—'}</Descriptions.Item>
          {guardian.notes && (
            <Descriptions.Item label="Izoh" span={3}>
              {guardian.notes}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title={`Bog'langan o'quvchilar (${guardian.students.length})`}>
        {guardian.students.length ? (
          <Table
            rowKey="studentId"
            size="small"
            pagination={false}
            dataSource={guardian.students}
            onRow={(record) => ({ onClick: () => navigate(`/students/${record.studentId}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Kod', render: (_, record) => record.student.studentCode },
              { title: 'F.I.Sh.', render: (_, record) => record.student.fullName },
              { title: 'Filial', render: (_, record) => record.student.branch?.name ?? '—' },
              { title: "Qarindoshlik", dataIndex: 'relationship', render: (v: string) => RELATIONSHIP_LABELS[v] ?? v },
              { title: 'Asosiymi', dataIndex: 'isPrimary', render: (v: boolean) => (v ? <Tag color="gold">Asosiy</Tag> : '—') },
              {
                title: 'Status',
                render: (_, record) => <Tag color={STUDENT_STATUS_COLORS[record.student.status]}>{record.student.status}</Tag>,
              },
              {
                title: 'Amallar',
                render: (_, record) =>
                  canEdit && (
                    <Popconfirm
                      title="Bog'lanishni bekor qilish?"
                      onConfirm={(e) => {
                        e?.stopPropagation();
                        unlinkMutation.mutate(record.studentId);
                      }}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <Button loading={unlinkMutation.isPending} size="small" danger onClick={(e) => e.stopPropagation()}>
                        Bekor qilish
                      </Button>
                    </Popconfirm>
                  ),
              },
            ]}
          />
        ) : (
          <EmptyState title="Bog'langan o'quvchilar yo'q" />
        )}
      </Card>

      <GuardianFormModal open={editOpen} onClose={() => setEditOpen(false)} guardian={guardian} />
    </div>
  );
}
