import { ArrowLeftOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Popconfirm, Row, Space, Spin, Statistic, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deactivateClassroom, getClassroom } from '../../api/classrooms';
import { ClassroomFormModal } from '../../components/ClassroomFormModal';
import { PageErrorState } from '../../components/PageErrorState';
import { useAuthStore } from '../../store/auth.store';
import type { ClassroomStatus } from '../../types';

const STATUS_COLORS: Record<ClassroomStatus, string> = { ACTIVE: 'green', INACTIVE: 'default', MAINTENANCE: 'gold' };
const STATUS_LABELS: Record<ClassroomStatus, string> = { ACTIVE: 'Faol', INACTIVE: 'Nofaol', MAINTENANCE: "Ta'mirlashda" };

export function ClassroomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [editOpen, setEditOpen] = useState(false);

  const classroomQuery = useQuery({ queryKey: ['classroom', id], queryFn: () => getClassroom(id!), enabled: !!id });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateClassroom(id!),
    onSuccess: () => {
      message.success('Xona nofaol qilindi');
      queryClient.invalidateQueries({ queryKey: ['classroom', id] });
      queryClient.invalidateQueries({ queryKey: ['classrooms'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Amalni bajarib bo'lmadi");
    },
  });

  if (classroomQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (classroomQuery.isError) {
    return <PageErrorState onRetry={() => classroomQuery.refetch()} />;
  }

  const classroom = classroomQuery.data;
  if (!classroom) return null;

  const canEdit = hasPermission('classrooms', 'EDIT');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
        Orqaga
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {classroom.name} <Tag>{classroom.roomNumber}</Tag>
            </Typography.Title>
            <Typography.Text
              type="secondary"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/branches/${classroom.branch.id}`)}
            >
              {classroom.branch.name}
            </Typography.Text>
          </Col>
          <Col>
            <Space>
              <Tag color={STATUS_COLORS[classroom.status]}>{STATUS_LABELS[classroom.status]}</Tag>
              {canEdit && (
                <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                  Tahrirlash
                </Button>
              )}
              {canEdit && classroom.status !== 'INACTIVE' && (
                <Popconfirm title="Xonani nofaol qilishni tasdiqlaysizmi?" onConfirm={() => deactivateMutation.mutate()}>
                  <Button loading={deactivateMutation.isPending} danger icon={<StopOutlined />}>
                    Nofaol qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>

        <Descriptions column={{ xs: 1, sm: 2 }} style={{ marginTop: 16 }}>
          <Descriptions.Item label="Jihozlar">{classroom.equipment ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Sig'imi">{classroom.capacity}</Descriptions.Item>
          {classroom.notes && (
            <Descriptions.Item label="Izoh" span={2}>
              {classroom.notes}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card>
            <Statistic title="Joriy guruhlar soni" value={classroom._count.studentGroups} />
          </Card>
        </Col>
      </Row>

      <ClassroomFormModal open={editOpen} onClose={() => setEditOpen(false)} classroom={classroom} />
    </div>
  );
}
