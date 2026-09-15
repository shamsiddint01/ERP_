import { ArrowLeftOutlined, CarryOutOutlined, CheckCircleOutlined, CloseCircleOutlined, EditOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Popconfirm, Row, Space, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cancelLesson, completeLesson, getLesson, noShowLesson, startLesson } from '../../api/lessons';
import { LessonFormModal } from '../../components/LessonFormModal';
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

  const lesson = lessonQuery.data;
  if (!lesson) return null;

  const canEdit = hasPermission('lessons', 'EDIT');
  const canViewAttendance = hasPermission('student_attendance', 'VIEW');
  const isBusy = startMutation.isPending || completeMutation.isPending || cancelMutation.isPending || noShowMutation.isPending;
  const isOpenState = lesson.status === 'SCHEDULED' || lesson.status === 'IN_PROGRESS';

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/lessons')} style={{ marginBottom: 8 }}>
        Darslar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              <Typography.Link onClick={() => navigate(`/groups/${lesson.group.id}`)}>{lesson.group.name}</Typography.Link>
            </Typography.Title>
            <Typography.Text type="secondary">
              {dayjs(lesson.scheduledStart).format('DD.MM.YYYY HH:mm')} – {dayjs(lesson.scheduledEnd).format('HH:mm')}
              {lesson.schedule && ` · ${lesson.branch.name}`}
            </Typography.Text>
          </Col>
          <Col>
            <Space wrap>
              <Tag color={STATUS_COLORS[lesson.status]}>{STATUS_LABELS[lesson.status]}</Tag>
              {canViewAttendance && lesson.status !== 'CANCELLED' && (
                <Button icon={<CarryOutOutlined />} onClick={() => navigate(`/lessons/${lesson.id}/attendance`)}>
                  Davomat
                </Button>
              )}
              {canEdit && lesson.status === 'SCHEDULED' && (
                <Button icon={<PlayCircleOutlined />} loading={isBusy} onClick={() => startMutation.mutate()}>
                  Boshlash
                </Button>
              )}
              {canEdit && isOpenState && (
                <Button icon={<CheckCircleOutlined />} loading={isBusy} onClick={() => completeMutation.mutate()}>
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
            </Space>
          </Col>
        </Row>

        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }}>
          <Descriptions.Item label="O'qituvchi">{lesson.teacherEmployee?.fullName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Xona">{lesson.classroom ? `${lesson.classroom.name} (${lesson.classroom.roomNumber})` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Filial">{lesson.branch.name}</Descriptions.Item>
          <Descriptions.Item label="Haqiqiy boshlanish">{lesson.actualStart ? dayjs(lesson.actualStart).format('DD.MM.YYYY HH:mm') : '—'}</Descriptions.Item>
          <Descriptions.Item label="Haqiqiy tugash">{lesson.actualEnd ? dayjs(lesson.actualEnd).format('DD.MM.YYYY HH:mm') : '—'}</Descriptions.Item>
          <Descriptions.Item label="Bog'liq jadval">
            {lesson.schedule ? `${DAY_LABELS[lesson.schedule.dayOfWeek]} ${lesson.schedule.startTime}-${lesson.schedule.endTime}` : 'Mustaqil dars'}
          </Descriptions.Item>
          <Descriptions.Item label="Mavzu" span={3}>
            {lesson.topic ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Uy vazifasi" span={3}>
            {lesson.homework ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Izoh" span={3}>
            {lesson.notes ?? '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <LessonFormModal open={editOpen} onClose={() => setEditOpen(false)} lesson={lesson} />
    </div>
  );
}
