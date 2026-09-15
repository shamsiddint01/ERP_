import { CheckCircleOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined, SwapOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Popconfirm, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { activateEnrollment, cancelEnrollmentAction, completeEnrollment, getEnrollment, pauseEnrollment } from '../../api/enrollments';
import { ActionBar } from '../../components/ActionBar';
import { DetailHeader } from '../../components/DetailHeader';
import { InfoGrid } from '../../components/InfoGrid';
import { PageErrorState } from '../../components/PageErrorState';
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

  if (enrollmentQuery.isError) {
    return <PageErrorState onRetry={() => enrollmentQuery.refetch()} />;
  }

  const enrollment = enrollmentQuery.data;
  if (!enrollment) return null;

  const canEdit = hasPermission('enrollments', 'EDIT');
  const isBusy = pauseMutation.isPending || activateMutation.isPending || completeMutation.isPending || cancelMutation.isPending;

  return (
    <div>
      <DetailHeader
        backLabel="Yozilishlar ro'yxatiga qaytish"
        onBack={() => navigate('/enrollments')}
        title={
          <>
            <Typography.Link onClick={() => navigate(`/students/${enrollment.student.id}`)}>{enrollment.student.fullName}</Typography.Link>
            {' → '}
            <Typography.Link onClick={() => navigate(`/groups/${enrollment.group.id}`)}>{enrollment.group.name}</Typography.Link>
          </>
        }
        subtitle={
          <>
            {enrollment.group.course.name} · {enrollment.group.branch.name}
          </>
        }
        actions={
          <ActionBar>
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
          </ActionBar>
        }
      >
        <InfoGrid
          items={[
            { label: "O'quvchi kodi", value: enrollment.student.studentCode },
            { label: "O'qituvchi", value: enrollment.group.teacherEmployee?.fullName },
            { label: 'Guruh kodi', value: enrollment.group.code },
            { label: 'Boshlanish sanasi', value: dayjs(enrollment.startDate).format('DD.MM.YYYY') },
            { label: 'Tugash sanasi', value: enrollment.endDate ? dayjs(enrollment.endDate).format('DD.MM.YYYY') : undefined },
            { label: "Kelishilgan to'lov", value: enrollment.agreedTuition ? Number(enrollment.agreedTuition).toLocaleString('uz-UZ') : undefined },
            { label: 'Chegirma', value: enrollment.discountAmount ? Number(enrollment.discountAmount).toLocaleString('uz-UZ') : undefined },
            ...(enrollment.notes ? [{ label: 'Izoh', value: enrollment.notes, span: 3 }] : []),
          ]}
        />
      </DetailHeader>

      <TransferEnrollmentModal open={transferOpen} onClose={() => setTransferOpen(false)} enrollment={enrollment} />
    </div>
  );
}
