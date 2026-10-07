import { CheckSquareOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Skeleton, Space, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listLessons } from '../../api/lessons';
import { EmptyState } from '../../components/EmptyState';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { palette, tint } from '../../theme';
import type { LessonListItem } from '../../types';
import { time } from '../portal/portalLabels';

const WEEKDAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

const LESSON_STATUS: Record<string, { label: string; color: string }> = {
  SCHEDULED: { label: 'Rejada', color: 'blue' },
  IN_PROGRESS: { label: 'Davom etmoqda', color: 'processing' },
  COMPLETED: { label: 'Yakunlangan', color: 'green' },
  CANCELLED: { label: 'Bekor qilingan', color: 'default' },
};

/** Monday 00:00 of the week containing `date`. */
function weekStart(date: Dayjs): Dayjs {
  return date.startOf('day').subtract((date.day() + 6) % 7, 'day');
}

const dayMonth = (d: Dayjs) => `${d.date()}-${MONTHS[d.month()]}`;

/** Teacher → "Dars jadvali": the teacher's lessons week by week; every lesson opens its attendance sheet ("Davomat"). */
export function TeacherSchedulePage() {
  const navigate = useNavigate();
  const [start, setStart] = useState(() => weekStart(dayjs()));
  const end = start.add(7, 'day');

  const lessonsQuery = useQuery({
    queryKey: ['lessons', { week: start.toISOString() }],
    queryFn: () => listLessons({ dateFrom: start.toISOString(), dateTo: end.subtract(1, 'millisecond').toISOString(), pageSize: 100, sortBy: 'scheduledStart', sortDir: 'asc' }),
  });

  if (lessonsQuery.isError) return <PageErrorState onRetry={() => lessonsQuery.refetch()} />;

  const lessons = lessonsQuery.data?.items ?? [];
  const days = Array.from({ length: 7 }, (_, i) => start.add(i, 'day'));
  const byDay = (day: Dayjs) => lessons.filter((l) => dayjs(l.scheduledStart).isSame(day, 'day'));
  const isThisWeek = start.isSame(weekStart(dayjs()), 'day');

  const lessonRow = (lesson: LessonListItem) => {
    const status = LESSON_STATUS[lesson.status] ?? { label: lesson.status, color: 'default' };
    const cancelled = lesson.status === 'CANCELLED';
    return (
      <div
        key={lesson.id}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: `1px solid ${palette.border}`, opacity: cancelled ? 0.6 : 1, flexWrap: 'wrap' }}
      >
        <div style={{ width: 92, flexShrink: 0, fontWeight: 700 }}>
          {time(lesson.scheduledStart)}–{time(lesson.scheduledEnd)}
        </div>
        <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onClick={() => navigate(`/lessons/${lesson.id}`)}>
          <Typography.Text strong ellipsis style={{ display: 'block' }}>
            {lesson.group.name}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {[lesson.classroom?.name, lesson.topic].filter(Boolean).join(' · ') || lesson.branch.name}
          </Typography.Text>
        </div>
        <Tag color={status.color} style={{ marginInlineEnd: 0 }}>
          {status.label}
        </Tag>
        {!cancelled && (
          <Button size="small" type="primary" icon={<CheckSquareOutlined />} onClick={() => navigate(`/lessons/${lesson.id}/attendance`)}>
            Davomat
          </Button>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Dars jadvali"
        subtitle="Haftalik darslaringiz — davomatni dars ichida belgilang"
        extra={
          <Space>
            <Button icon={<LeftOutlined />} onClick={() => setStart(start.subtract(7, 'day'))} aria-label="Oldingi hafta" />
            <Button onClick={() => setStart(weekStart(dayjs()))} disabled={isThisWeek}>
              Bu hafta
            </Button>
            <Button icon={<RightOutlined />} onClick={() => setStart(start.add(7, 'day'))} aria-label="Keyingi hafta" />
          </Space>
        }
      />
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        {dayMonth(start)} — {dayMonth(end.subtract(1, 'day'))} · {lessons.length} ta dars
      </div>
      {lessonsQuery.isLoading ? (
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      ) : lessons.length === 0 ? (
        <Card>
          <EmptyState title="Bu haftada dars yo'q" />
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {days.map((day) => {
            const dayLessons = byDay(day);
            if (dayLessons.length === 0) return null;
            const today = day.isSame(dayjs(), 'day');
            return (
              <Card
                key={day.toISOString()}
                size="small"
                style={today ? { borderColor: palette.primary, background: tint(palette.primary, 5) } : undefined}
                styles={{ body: { padding: '12px 18px 4px' } }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <strong>{WEEKDAYS[weekdayIndex(day)]}</strong>
                  <span style={{ color: palette.textMuted, fontSize: 13 }}>{dayMonth(day)}</span>
                  {today && <Tag color="orange">Bugun</Tag>}
                </div>
                {dayLessons.map(lessonRow)}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 0 = Monday … 6 = Sunday. */
function weekdayIndex(day: Dayjs): number {
  return (day.day() + 6) % 7;
}
