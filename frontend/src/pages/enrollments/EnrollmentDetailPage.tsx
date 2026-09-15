import { ArrowLeftOutlined, CheckCircleOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined, SwapOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Popconfirm, Row, Space, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { activateEnrollment, cancelEnrollmentAction, completeEnrollment, getEnrollment, pauseEnrollment } from '../../api/enrollments';
import { TransferEnrollmentModal } from '../../components/TransferEnrollmentModal';
import { useAuthStore } from '../../store/auth.store';
import type { EnrollmentStatus } from '../../types';

const STATUS_COLORS: Record<EnrollmentStatus, string> = { ACTIVE: 'green', PAUSED: 'gold', COMPLETED: 'blue', CANCELLED: 'red', TRANSFERRED: 'purple' };
const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  ACTIVE: 'Faol',
  PAUSED: 'Muzlatilgan',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
  TRANSFERRED: "Ko'chirilgan",
};

export function EnrollmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [transferOpen, setTransferOpen] = useState(false);

  const enrollmentQuery = useQuery({ queryKey: ['enrollment', id], queryFn: () => getEnrollment(id!), enabled: !!id });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['enrollment', id] });
    queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    queryClient.invalidateQueries({ queryKey: ['group'] });
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    queryClient.invalidateQueries({ queryKey: ['student'] });
  }

  function onActionError(error: unknown) {
    const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    message.error(detail ?? "Amalni bajarib bo'lmadi");
  }

  const pauseMutation = useMutation({
    mutationFn: () => pauseEnrollment(id!),
    onSuccess: () => {
      message.success('Yozilish muzlatildi');
      invalidate();
    },
    onError: onActionError,
  });
  const activateMutation = useMutation({
    mutationFn: () => activateEnrollment(id!),
    onSuccess: () => {
      message.success('Yozilish tiklandi');
      invalidate();
    },
    onError: onActionError,
  });
  const completeMutation = useMutation({
    mutationFn: () => completeEnrollment(id!),
    onSuccess: () => {
      message.success('Yozilish yakunlandi');
      invalidate();
    },
    onError: onActionError,
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelEnrollmentAction(id!),
    onSuccess: () => {
      message.success('Yozilish bekor qilindi');
      invalidate();
    },
    onError: onActionError,
  });

  if (enrollmentQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const enrollment = enrollmentQuery.data;
  if (!enrollment) return null;

  const canEdit = hasPermission('enrollments', 'EDIT');
  const isBusy = pauseMutation.isPending || activateMutation.isPending || completeMutation.isPending || cancelMutation.isPending;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/enrollments')} style={{ marginBottom: 8 }}>
        Yozilishlar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              <Typography.Link onClick={() => navigate(`/students/${enrollment.student.id}`)}>{enrollment.student.fullName}</Typography.Link>
              {' → '}
              <Typography.Link onClick={() => navigate(`/groups/${enrollment.group.id}`)}>{enrollment.group.name}</Typography.Link>
            </Typography.Title>
            <Typography.Text type="secondary">
              {enrollment.group.course.name} · {enrollment.group.branch.name}
            </Typography.Text>
          </Col>
          <Col>
            <Space wrap>
              <Tag color={STATUS_COLORS[enrollment.status]}>{STATUS_LABELS[enrollment.status]}</Tag>
              {canEdit && enrollment.status === 'ACTIVE' && (
                <Button icon={<PauseCircleOutlined />} loading={isBusy} onClick={() => pauseMutation.mutate()}>
                  Muzlatish
                </Button>
              )}
              {canEdit && enrollment.status === 'PAUSED' && (
                <Button icon={<PlayCircleOutlined />} loading={isBusy} onClick={() => activateMutation.mutate()}>
                  Tiklash
                </Button>
              )}
              {canEdit && enrollment.status === 'ACTIVE' && (
                <Button icon={<CheckCircleOutlined />} loading={isBusy} onClick={() => completeMutation.mutate()}>
                  Yakunlash
                </Button>
              )}
              {canEdit && ['ACTIVE', 'PAUSED'].includes(enrollment.status) && (
                <Button icon={<SwapOutlined />} onClick={() => setTransferOpen(true)}>
                  Ko'chirish
                </Button>
              )}
              {canEdit && ['ACTIVE', 'PAUSED'].includes(enrollment.status) && (
                <Popconfirm title="Yozilishni bekor qilishni tasdiqlaysizmi?" onConfirm={() => cancelMutation.mutate()}>
                  <Button danger icon={<StopOutlined />} loading={isBusy}>
                    Bekor qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>

        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }}>
          <Descriptions.Item label="O'quvchi kodi">{enrollment.student.studentCode}</Descriptions.Item>
          <Descriptions.Item label="O'qituvchi">{enrollment.group.teacherEmployee?.fullName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Guruh kodi">{enrollment.group.code}</Descriptions.Item>
          <Descriptions.Item label="Boshlanish sanasi">{dayjs(enrollment.startDate).format('DD.MM.YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Tugash sanasi">{enrollment.endDate ? dayjs(enrollment.endDate).format('DD.MM.YYYY') : '—'}</Descriptions.Item>
          <Descriptions.Item label="Kelishilgan to'lov">{enrollment.agreedTuition ? Number(enrollment.agreedTuition).toLocaleString('uz-UZ') : '—'}</Descriptions.Item>
          <Descriptions.Item label="Chegirma">{enrollment.discountAmount ? Number(enrollment.discountAmount).toLocaleString('uz-UZ') : '—'}</Descriptions.Item>
          {enrollment.notes && (
            <Descriptions.Item label="Izoh" span={3}>
              {enrollment.notes}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <TransferEnrollmentModal open={transferOpen} onClose={() => setTransferOpen(false)} enrollment={enrollment} />
    </div>
  );
}
