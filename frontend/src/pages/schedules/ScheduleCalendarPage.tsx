import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, DatePicker, Empty, List, Segmented, Select, Space, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBranches } from '../../api/branches';
import { listLessons } from '../../api/lessons';
import { listSchedules } from '../../api/schedules';
import { PageErrorState } from '../../components/PageErrorState';
import { useAuthStore } from '../../store/auth.store';
import type { LessonStatus, ScheduleDayOfWeek, ScheduleListItem } from '../../types';

const DAYS: ScheduleDayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_LABELS: Record<ScheduleDayOfWeek, string> = {
  MONDAY: 'Dushanba',
  TUESDAY: 'Seshanba',
  WEDNESDAY: 'Chorshanba',
  THURSDAY: 'Payshanba',
  FRIDAY: 'Juma',
  SATURDAY: 'Shanba',
  SUNDAY: 'Yakshanba',
};
const LESSON_STATUS_COLORS: Record<LessonStatus, string> = { SCHEDULED: 'default', IN_PROGRESS: 'blue', COMPLETED: 'green', CANCELLED: 'red', NO_SHOW: 'orange' };
const LESSON_STATUS_LABELS: Record<LessonStatus, string> = {
  SCHEDULED: 'Rejalashtirilgan',
  IN_PROGRESS: 'Jarayonda',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
  NO_SHOW: 'Kelmadi',
};

/**
 * Week view shows the recurring weekly *Schedule* pattern (no specific date —
 * "every Monday at 18:00"). Day view shows the actual dated *Lesson*
 * instances for one calendar day. Deliberately two separate data sources,
 * mirroring the Schedule-vs-Lesson split everywhere else in Phase E — this
 * is not one blended "calendar event" model.
 */
export function ScheduleCalendarPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [view, setView] = useState<'week' | 'day'>('week');
  const [branchId, setBranchId] = useState<string | undefined>();
  const [date, setDate] = useState<Dayjs>(() => dayjs());

  const canBranches = hasPermission('branches', 'VIEW');
  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100, forCalendarFilter: true }], queryFn: () => listBranches({ pageSize: 100 }), enabled: canBranches });

  // pageSize is capped at 100 server-side (PaginationQueryDto) — the same
  // practical "give me everything" ceiling used for every dropdown query
  // throughout this app (listGroups/listTeachers/etc. all use 100 too).
  const schedulesQuery = useQuery({
    queryKey: ['schedules', 'calendar', { branchId }],
    queryFn: () => listSchedules({ branchId, status: 'ACTIVE', pageSize: 100 }),
    enabled: view === 'week',
  });

  const lessonsQuery = useQuery({
    queryKey: ['lessons', 'calendar', { branchId, date: date.format('YYYY-MM-DD') }],
    queryFn: () => listLessons({ branchId, dateFrom: date.startOf('day').toISOString(), dateTo: date.endOf('day').toISOString(), pageSize: 100 }),
    enabled: view === 'day',
  });

  const schedulesByDay = useMemo(() => {
    const map = Object.fromEntries(DAYS.map((d) => [d, [] as ScheduleListItem[]])) as Record<ScheduleDayOfWeek, ScheduleListItem[]>;
    for (const schedule of schedulesQuery.data?.items ?? []) map[schedule.dayOfWeek].push(schedule);
    for (const day of DAYS) map[day].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [schedulesQuery.data]);

  const sortedLessons = useMemo(
    () => [...(lessonsQuery.data?.items ?? [])].sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    [lessonsQuery.data],
  );

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/schedules')} style={{ marginBottom: 8 }}>
        Dars jadvallari ro'yxatiga qaytish
      </Button>

      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Taqvim
        </Typography.Title>
        <Space wrap>
          {canBranches && (
            <Select
              placeholder="Barcha filiallar"
              allowClear
              style={{ width: 200 }}
              options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))}
              onChange={setBranchId}
            />
          )}
          <Segmented value={view} onChange={(v) => setView(v as 'week' | 'day')} options={[{ label: 'Hafta', value: 'week' }, { label: 'Kun', value: 'day' }]} />
          {view === 'day' && <DatePicker value={date} onChange={(v) => v && setDate(v)} allowClear={false} />}
        </Space>
      </Space>

      {view === 'week' && schedulesQuery.isError ? (
        <PageErrorState onRetry={() => schedulesQuery.refetch()} />
      ) : view === 'day' && lessonsQuery.isError ? (
        <PageErrorState onRetry={() => lessonsQuery.refetch()} />
      ) : view === 'week' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(160px, 1fr))', gap: 12, overflowX: 'auto' }}>
          {DAYS.map((day) => (
            <Card key={day} title={DAY_LABELS[day]} size="small" loading={schedulesQuery.isLoading}>
              {schedulesByDay[day].length === 0 ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Darslar yo'q
                </Typography.Text>
              ) : (
                <Space orientation="vertical" style={{ width: '100%' }} size={8}>
                  {schedulesByDay[day].map((schedule) => (
                    <div
                      key={schedule.id}
                      onClick={() => navigate('/schedules')}
                      style={{ cursor: 'pointer', padding: 8, borderRadius: 6, background: 'rgba(22,119,255,0.08)', borderLeft: '3px solid #1677ff' }}
                    >
                      <Typography.Text strong style={{ fontSize: 12 }}>
                        {schedule.startTime}–{schedule.endTime}
                      </Typography.Text>
                      <div style={{ fontSize: 12 }}>{schedule.group.name}</div>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {schedule.teacherEmployee?.fullName ?? "O'qituvchisiz"} · {schedule.classroom?.name ?? 'Xonasiz'}
                      </Typography.Text>
                    </div>
                  ))}
                </Space>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card loading={lessonsQuery.isLoading}>
          {sortedLessons.length === 0 ? (
            <Empty description="Bu kunga darslar rejalashtirilmagan" />
          ) : (
            <List
              dataSource={sortedLessons}
              renderItem={(lesson) => (
                <List.Item onClick={() => navigate(`/lessons/${lesson.id}`)} style={{ cursor: 'pointer' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                    <Space>
                      <Typography.Text strong>
                        {dayjs(lesson.scheduledStart).format('HH:mm')}–{dayjs(lesson.scheduledEnd).format('HH:mm')}
                      </Typography.Text>
                      <Typography.Text>{lesson.group.name}</Typography.Text>
                      <Typography.Text type="secondary">
                        {lesson.teacherEmployee?.fullName ?? '—'} · {lesson.classroom?.name ?? '—'}
                      </Typography.Text>
                    </Space>
                    <Tag color={LESSON_STATUS_COLORS[lesson.status]}>{LESSON_STATUS_LABELS[lesson.status]}</Tag>
                  </Space>
                </List.Item>
              )}
            />
          )}
        </Card>
      )}
    </div>
  );
}
