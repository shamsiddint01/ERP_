import { ArrowLeftOutlined, EditOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Empty, Popconfirm, Row, Space, Spin, Statistic, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deactivateBranch, getBranch } from '../../api/branches';
import { BranchFormModal } from '../../components/BranchFormModal';
import { ClassroomFormModal } from '../../components/ClassroomFormModal';
import { PageErrorState } from '../../components/PageErrorState';
import { useAuthStore } from '../../store/auth.store';
import type { BranchStatus, ClassroomStatus } from '../../types';

const STATUS_COLORS: Record<BranchStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };
const STATUS_LABELS: Record<BranchStatus, string> = { ACTIVE: 'Faol', INACTIVE: 'Nofaol' };
const CLASSROOM_STATUS_COLORS: Record<ClassroomStatus, string> = { ACTIVE: 'green', INACTIVE: 'default', MAINTENANCE: 'gold' };

export function BranchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [editOpen, setEditOpen] = useState(false);
  const [classroomModalOpen, setClassroomModalOpen] = useState(false);

  const branchQuery = useQuery({ queryKey: ['branch', id], queryFn: () => getBranch(id!), enabled: !!id });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateBranch(id!),
    onSuccess: () => {
      message.success('Filial nofaol qilindi');
      queryClient.invalidateQueries({ queryKey: ['branch', id] });
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Amalni bajarib bo'lmadi");
    },
  });

  if (branchQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (branchQuery.isError) {
    return <PageErrorState onRetry={() => branchQuery.refetch()} />;
  }

  const branch = branchQuery.data;
  if (!branch) return null;

  const canEdit = hasPermission('branches', 'EDIT');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/branches')} style={{ marginBottom: 8 }}>
        Filiallar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {branch.name} <Tag>{branch.code}</Tag>
            </Typography.Title>
            <Typography.Text type="secondary">{branch.address ?? 'Manzil kiritilmagan'}</Typography.Text>
          </Col>
          <Col>
            <Space>
              <Tag color={STATUS_COLORS[branch.status]}>{STATUS_LABELS[branch.status]}</Tag>
              {canEdit && (
                <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                  Tahrirlash
                </Button>
              )}
              {canEdit && branch.status !== 'INACTIVE' && (
                <Popconfirm title="Filialni nofaol qilishni tasdiqlaysizmi?" onConfirm={() => deactivateMutation.mutate()}>
                  <Button loading={deactivateMutation.isPending} danger icon={<StopOutlined />}>
                    Nofaol qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>

        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }}>
          <Descriptions.Item label="Telefon">{branch.phone ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Email">{branch.email ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Ish vaqti">{branch.workingHours ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Rahbar">{branch.managerEmployee?.fullName ?? '—'}</Descriptions.Item>
          {branch.notes && (
            <Descriptions.Item label="Izoh" span={2}>
              {branch.notes}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic title="Xonalar soni" value={branch.classrooms.length} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="O'quvchilar soni" value={branch._count.students} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Faol guruhlar soni" value={branch.activeGroupCount} styles={{ content: { color: '#3f8600' } }} />
          </Card>
        </Col>
      </Row>

      <Card
        title="Xonalar"
        extra={
          canEdit && (
            <Button size="small" icon={<PlusOutlined />} onClick={() => setClassroomModalOpen(true)}>
              Yangi xona
            </Button>
          )
        }
      >
        {branch.classrooms.length ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={branch.classrooms}
            onRow={(record) => ({ onClick: () => navigate(`/classrooms/${record.id}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Nomi', dataIndex: 'name' },
              { title: 'Xona raqami', dataIndex: 'roomNumber' },
              { title: "Sig'imi", dataIndex: 'capacity' },
              { title: 'Status', dataIndex: 'status', render: (v: ClassroomStatus) => <Tag color={CLASSROOM_STATUS_COLORS[v]}>{v}</Tag> },
            ]}
          />
        ) : (
          <Empty description="Xonalar hali qo'shilmagan" />
        )}
      </Card>

      <BranchFormModal open={editOpen} onClose={() => setEditOpen(false)} branch={branch} />
      <ClassroomFormModal open={classroomModalOpen} onClose={() => setClassroomModalOpen(false)} defaultBranchId={branch.id} />
    </div>
  );
}
