import { CalendarOutlined, CheckOutlined, ClockCircleOutlined, EnvironmentOutlined, UserOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Popconfirm, Progress, Row, Skeleton, Tag, Typography } from 'antd';
import { cancelExtraLessonRegistration, getPortalExtraLessons, registerExtraLesson } from '../../api/portal';
import { EmptyState } from '../../components/EmptyState';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { palette } from '../../theme';
import type { PortalExtraLesson } from '../../types';
import { longDate, time } from './portalLabels';

function apiError(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(detail) ? detail.join(', ') : (detail ?? fallback);
}

const meta = { display: 'flex', alignItems: 'center', gap: 8, color: palette.textSecondary, fontSize: 13, marginTop: 6 } as const;

export function PortalExtraLessonsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const lessonsQuery = useQuery({ queryKey: ['portal', 'extra-lessons'], queryFn: getPortalExtraLessons });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['portal'] });
  const registerMutation = useMutation({
    mutationFn: registerExtraLesson,
    onSuccess: () => {
      message.success('Darsga yozildingiz');
      refresh();
    },
    onError: (error) => {
      message.error(apiError(error, "Yozilib bo'lmadi"));
      refresh();
    },
  });
  const cancelMutation = useMutation({
    mutationFn: cancelExtraLessonRegistration,
    onSuccess: () => {
      message.success('Yozilish bekor qilindi');
      refresh();
    },
    onError: (error) => message.error(apiError(error, "Bekor qilib bo'lmadi")),
  });

  if (lessonsQuery.isError) return <PageErrorState onRetry={() => lessonsQuery.refetch()} />;

  const lessons = lessonsQuery.data ?? [];
  const upcoming = lessons.filter((l) => !l.isPast);
  const past = lessons.filter((l) => l.isPast);

  const renderCard = (lesson: PortalExtraLesson) => {
    const full = lesson.seatsLeft === 0 && !lesson.isRegistered;
    const cancelled = lesson.status === 'CANCELLED';
    return (
      <Col xs={24} md={12} xl={8} key={lesson.id}>
        <Card
          style={{ height: '100%', opacity: lesson.isPast || cancelled ? 0.65 : 1, borderColor: lesson.isRegistered ? 'rgba(245,165,36,0.45)' : undefined }}
          styles={{ body: { padding: 20, display: 'flex', flexDirection: 'column', height: '100%' } }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span className="eyebrow">{lesson.course?.name ?? "Qo'shimcha dars"}</span>
            {cancelled ? <Tag color="red">Bekor qilingan</Tag> : lesson.isRegistered && <Tag color="orange" icon={<CheckOutlined />}>Yozilgansiz</Tag>}
          </div>
          <Typography.Title level={5} style={{ margin: '6px 0 4px' }}>
            {lesson.title}
          </Typography.Title>
          {lesson.description && (
            <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 4 }} ellipsis={{ rows: 2, expandable: true, symbol: "ko'proq" }}>
              {lesson.description}
            </Typography.Paragraph>
          )}
          <div style={meta}>
            <CalendarOutlined /> {longDate(lesson.startsAt)}
          </div>
          <div style={meta}>
            <ClockCircleOutlined /> {time(lesson.startsAt)} – {time(lesson.endsAt)}
          </div>
          {lesson.teacherEmployee && (
            <div style={meta}>
              <UserOutlined /> {lesson.teacherEmployee.fullName}
            </div>
          )}
          {(lesson.branch || lesson.room) && (
            <div style={meta}>
              <EnvironmentOutlined /> {[lesson.branch?.name, lesson.room].filter(Boolean).join(' · ')}
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: palette.textSecondary }}>
              <span>
                {lesson.registeredCount} / {lesson.capacity} joy band
              </span>
              <span style={{ color: full ? palette.error : palette.success, fontWeight: 600 }}>{full ? "Joy yo'q" : `${lesson.seatsLeft} ta bo'sh`}</span>
            </div>
            <Progress percent={Math.round((lesson.registeredCount / lesson.capacity) * 100)} showInfo={false} strokeColor={full ? palette.error : palette.primary} size="small" />
            {!lesson.isPast && !cancelled && (
              <div style={{ marginTop: 10 }}>
                {lesson.isRegistered ? (
                  <Popconfirm title="Yozilishni bekor qilasizmi?" okText="Ha" cancelText="Yo'q" onConfirm={() => cancelMutation.mutate(lesson.id)}>
                    <Button block loading={cancelMutation.isPending && cancelMutation.variables === lesson.id}>
                      Bekor qilish
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button
                    type="primary"
                    block
                    disabled={full}
                    loading={registerMutation.isPending && registerMutation.variables === lesson.id}
                    onClick={() => registerMutation.mutate(lesson.id)}
                  >
                    Yozilish
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      </Col>
    );
  };

  return (
    <div>
      <PageHeader title="Qo'shimcha darslar" subtitle="Markaz tashkil qilgan qo'shimcha mashg'ulotlarga yoziling" />
      {lessonsQuery.isLoading ? (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : upcoming.length === 0 && past.length === 0 ? (
        <Card>
          <EmptyState title="Hozircha qo'shimcha dars e'lon qilinmagan" />
        </Card>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <Row gutter={[16, 16]}>{upcoming.map(renderCard)}</Row>
          ) : (
            <Card>
              <EmptyState title="Yaqin kunlarda qo'shimcha dars yo'q" />
            </Card>
          )}
          {past.length > 0 && (
            <>
              <div className="eyebrow" style={{ margin: '28px 0 12px' }}>
                O'tgan darslarim
              </div>
              <Row gutter={[16, 16]}>{past.map(renderCard)}</Row>
            </>
          )}
        </>
      )}
    </div>
  );
}
