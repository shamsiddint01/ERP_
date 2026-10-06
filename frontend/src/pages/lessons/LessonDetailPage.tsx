import { CarryOutOutlined, CheckCircleOutlined, CloseCircleOutlined, EditOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Popconfirm, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cancelLesson, completeLesson, getLesson, noShowLesson, startLesson } from '../../api/lessons';
import { ActionBar } from '../../components/ActionBar';
import { DetailHeader } from '../../components/DetailHeader';
import { InfoGrid } from '../../components/InfoGrid';
import { LessonFormModal } from '../../components/LessonFormModal';
import { PageErrorState } from '../../components/PageErrorState';
import { useAuthStore } from '../../store/auth.store';
import type { LessonStatus, ScheduleDayOfWeek } from '../../types';

const STATUS_COLORS: Record<LessonStatus, string> = { SCHEDULED: 'default', IN_PROGRESS: 'blue', COMPLETED: 'green', CANCELLED: 'red', NO_SHOW: 'orange' };
const STATUS_LABELS: Record<LessonStatus, string> = {
  SCHEDULED: 'Rejalashtirilgan',
  IN_PROGRESS: 'Jarayonda',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
  NO_SHOW: 'Kelmadi',
};
const DAY_LABELS: Record<ScheduleDayOfWeek, string> = {
  MONDAY: 'Dushanba',
  TUESDAY: 'Seshanba',
  WEDNESDAY: 'Chorshanba',
  THURSDAY: 'Payshanba',
  FRIDAY: 'Juma',
  SATURDAY: 'Shanba',
  SUNDAY: 'Yakshanba',
};

export function LessonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [editOpen, setEditOpen] = useState(false);

  const lessonQuery = useQuery({ queryKey: ['lesson', id], queryFn: () => getLesson(id!), enabled: !!id });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['lesson', id] });
    queryClient.invalidateQueries({ queryKey: ['lessons'] });
  }

  function onActionError(error: unknown) {
    const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    message.error(detail ?? "Amalni bajarib bo'lmadi");
  }

  const startMutation = useMutation({
    mutationFn: () => startLesson(id!),
    onSuccess: () => {
      message.success('Dars boshlandi');
      invalidate();
    },
    onError: onActionError,
  });
  const completeMutation = useMutation({
    mutationFn: () => completeLesson(id!),
    onSuccess: () => {
      message.success('Dars yakunlandi');
      invalidate();
    },
    onError: onActionError,
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelLesson(id!),
    onSuccess: () => {
      message.success('Dars bekor qilindi');
      invalidate();
    },
    onError: onActionError,
  });
  const noShowMutation = useMutation({
    mutationFn: () => noShowLesson(id!),
    onSuccess: () => {
      message.success("O'quvchi(lar) kelmagani qayd etildi");
      invalidate();
    },
    onError: onActionError,
  });

  if (lessonQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (lessonQuery.isError) {
    return <PageErrorState onRetry={() => lessonQuery.refetch()} />;
  }

  const lesson = lessonQuery.data;
  if (!lesson) return null;

  const canEdit = hasPermission('lessons', 'EDIT');
  const canViewAttendance = hasPermission('student_attendance', 'VIEW');
  const isBusy = startMutation.isPending || completeMutation.isPending || cancelMutation.isPending || noShowMutation.isPending;
  const isOpenState = lesson.status === 'SCHEDULED' || lesson.status === 'IN_PROGRESS';

  return (
    <div>
      <DetailHeader
        backLabel="Darslar ro'yxatiga qaytish"
        onBack={() => navigate('/attendance')}
        title={<Typography.Link onClick={() => navigate(`/groups/${lesson.group.id}`)}>{lesson.group.name}</Typography.Link>}
        subtitle={
          <>
            {dayjs(lesson.scheduledStart).format('DD.MM.YYYY HH:mm')} – {dayjs(lesson.scheduledEnd).format('HH:mm')}
            {lesson.schedule && ` · ${lesson.branch.name}`}
          </>
        }
        actions={
          <ActionBar>
            <Tag color={STATUS_COLORS[lesson.status]}>{STATUS_LABELS[lesson.status]}</Tag>
            {canViewAttendance && lesson.status !== 'CANCELLED' && (
              <Button icon={<CarryOutOutlined />} onClick={() => navigate(`/lessons/${lesson.id}/attendance`)}>
                Davomat
              </Button>
            )}
            {canEdit && lesson.status === 'SCHEDULED' && (
              <Button type="primary" icon={<PlayCircleOutlined />} loading={isBusy} onClick={() => startMutation.mutate()}>
                Boshlash
              </Button>
            )}
            {canEdit && isOpenState && (
              <Button type={lesson.status === 'IN_PROGRESS' ? 'primary' : undefined} icon={<CheckCircleOutlined />} loading={isBusy} onClick={() => completeMutation.mutate()}>
                Yakunlash
              </Button>
            )}
            {canEdit && isOpenState && (
              <Popconfirm title="O'quvchi(lar) darsga kelmaganini tasdiqlaysizmi?" onConfirm={() => noShowMutation.mutate()}>
                <Button icon={<CloseCircleOutlined />} loading={isBusy}>
                  Kelmadi
                </Button>
              </Popconfirm>
            )}
            {canEdit && (
              <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                Tahrirlash
              </Button>
            )}
            {canEdit && isOpenState && (
              <Popconfirm title="Darsni bekor qilishni tasdiqlaysizmi?" onConfirm={() => cancelMutation.mutate()}>
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
            { label: "O'qituvchi", value: lesson.teacherEmployee?.fullName },
            { label: 'Xona', value: lesson.classroom ? `${lesson.classroom.name} (${lesson.classroom.roomNumber})` : undefined },
            { label: 'Filial', value: lesson.branch.name },
            { label: 'Haqiqiy boshlanish', value: lesson.actualStart ? dayjs(lesson.actualStart).format('DD.MM.YYYY HH:mm') : undefined },
            { label: 'Haqiqiy tugash', value: lesson.actualEnd ? dayjs(lesson.actualEnd).format('DD.MM.YYYY HH:mm') : undefined },
            {
              label: "Bog'liq jadval",
              value: lesson.schedule ? `${DAY_LABELS[lesson.schedule.dayOfWeek]} ${lesson.schedule.startTime}-${lesson.schedule.endTime}` : 'Mustaqil dars',
            },
            { label: 'Mavzu', value: lesson.topic, span: 3 },
            { label: 'Uy vazifasi', value: lesson.homework, span: 3 },
            { label: 'Izoh', value: lesson.notes, span: 3 },
          ]}
        />
      </DetailHeader>

      <LessonFormModal open={editOpen} onClose={() => setEditOpen(false)} lesson={lesson} />
    </div>
  );
}
