import { ArrowLeftOutlined, DownloadOutlined, EditOutlined, PlusOutlined, StopOutlined, ThunderboltOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Descriptions, Popconfirm, Progress, Row, Space, Spin, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { EmptyState } from '../../components/EmptyState';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { deactivateGroup, getGroup, getGroupResults } from '../../api/groups';
import { listLessons } from '../../api/lessons';
import { cancelSchedule, listSchedules } from '../../api/schedules';
import { downloadGroupAttendanceCsv, getGroupAttendanceSummary } from '../../api/studentAttendance';
import { EnrollmentFormModal } from '../../components/EnrollmentFormModal';
import { GenerateLessonsModal } from '../../components/GenerateLessonsModal';
import { GroupFormModal } from '../../components/GroupFormModal';
import { PageErrorState } from '../../components/PageErrorState';
import { ScheduleFormModal } from '../../components/ScheduleFormModal';
import { palette } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../utils/format';
import type { EnrollmentStatus, GroupAttendanceStudentRow, ScheduleDayOfWeek, ScheduleDetail, ScheduleStatus, StudentGroupStatus } from '../../types';

const STATUS_COLORS: Record<StudentGroupStatus, string> = { PLANNED: 'default', ACTIVE: 'green', PAUSED: 'gold', COMPLETED: 'blue', CANCELLED: 'red' };
const STATUS_LABELS: Record<StudentGroupStatus, string> = {
  PLANNED: 'Rejalashtirilgan',
  ACTIVE: 'Faol',
  PAUSED: 'Muzlatilgan',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
};
const ENROLLMENT_STATUS_COLORS: Record<EnrollmentStatus, string> = { ACTIVE: 'green', PAUSED: 'gold', COMPLETED: 'blue', CANCELLED: 'red', TRANSFERRED: 'purple' };
const DAY_LABELS: Record<ScheduleDayOfWeek, string> = {
  MONDAY: 'Dushanba',
  TUESDAY: 'Seshanba',
  WEDNESDAY: 'Chorshanba',
  THURSDAY: 'Payshanba',
  FRIDAY: 'Juma',
  SATURDAY: 'Shanba',
  SUNDAY: 'Yakshanba',
};
const SCHEDULE_STATUS_COLORS: Record<ScheduleStatus, string> = { ACTIVE: 'green', PAUSED: 'gold', CANCELLED: 'red' };
const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = { ACTIVE: 'Faol', PAUSED: 'Muzlatilgan', CANCELLED: 'Bekor qilingan' };
const LESSON_STATUS_COLORS: Record<string, string> = { SCHEDULED: 'default', IN_PROGRESS: 'blue', COMPLETED: 'green', CANCELLED: 'red', NO_SHOW: 'orange' };
const LESSON_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Rejalashtirilgan',
  IN_PROGRESS: 'Jarayonda',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
  NO_SHOW: 'Kelmadi',
};

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [editOpen, setEditOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleDetail | undefined>();
  const [generateFor, setGenerateFor] = useState<ScheduleDetail | undefined>();
  const [attendanceDateRange, setAttendanceDateRange] = useState<[string, string] | undefined>();

  const activeTab = searchParams.get('tab') ?? 'overview';
  const setActiveTab = (key: string) => setSearchParams(key === 'overview' ? {} : { tab: key }, { replace: true });

  const canEdit = hasPermission('groups', 'EDIT');
  const canEnroll = hasPermission('enrollments', 'CREATE');
  const canCreateSchedule = hasPermission('schedules', 'CREATE');
  const canEditSchedule = hasPermission('schedules', 'EDIT');
  const canDeleteSchedule = hasPermission('schedules', 'DELETE');
  const canViewAttendance = hasPermission('student_attendance', 'VIEW');
  const canViewLessons = hasPermission('lessons', 'VIEW');
  const canViewResults = hasPermission('grades', 'VIEW');

  const groupQuery = useQuery({ queryKey: ['group', id], queryFn: () => getGroup(id!), enabled: !!id });
  const schedulesQuery = useQuery({ queryKey: ['schedules', { groupId: id }], queryFn: () => listSchedules({ groupId: id!, pageSize: 100 }), enabled: !!id && activeTab === 'schedule' });
  const lessonsQuery = useQuery({
    queryKey: ['lessons', { groupId: id, forGroupTab: true }],
    queryFn: () => listLessons({ groupId: id!, pageSize: 50, sortBy: 'scheduledStart', sortDir: 'desc' }),
    enabled: !!id && canViewLessons && activeTab === 'lessons',
  });
  const attendanceSummaryQuery = useQuery({
    queryKey: ['group-attendance', id, { attendanceDateRange }],
    queryFn: () => getGroupAttendanceSummary(id!, { dateFrom: attendanceDateRange?.[0], dateTo: attendanceDateRange?.[1] }),
    enabled: !!id && canViewAttendance && activeTab === 'attendance',
  });
  const resultsQuery = useQuery({ queryKey: ['group-results', id], queryFn: () => getGroupResults(id!), enabled: !!id && canViewResults && activeTab === 'results' });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateGroup(id!),
    onSuccess: () => {
      message.success('Guruh bekor qilindi');
      queryClient.invalidateQueries({ queryKey: ['group', id] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Amalni bajarib bo'lmadi");
    },
  });

  async function handleCancelSchedule(schedule: ScheduleDetail) {
    try {
      await cancelSchedule(schedule.id);
      message.success('Dars jadvali bekor qilindi');
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Bekor qilib bo'lmadi");
    }
  }

  async function handleExportAttendance() {
    try {
      await downloadGroupAttendanceCsv(id!, { dateFrom: attendanceDateRange?.[0], dateTo: attendanceDateRange?.[1] });
    } catch {
      message.error("Hisobotni yuklab bo'lmadi");
    }
  }

  if (groupQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (groupQuery.isError) {
    return <PageErrorState onRetry={() => groupQuery.refetch()} />;
  }

  const group = groupQuery.data;
  if (!group) return null;

  const groupAverageAttendance = attendanceSummaryQuery.data?.students.length
    ? Math.round((attendanceSummaryQuery.data.students.reduce((sum, s) => sum + s.attendancePercentage, 0) / attendanceSummaryQuery.data.students.length) * 100) / 100
    : 0;

  const tabs = [
    {
      key: 'overview',
      label: 'Umumiy',
      children: (
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Daraja">{group.level ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Boshlanish sanasi">{formatDate(group.startDate)}</Descriptions.Item>
          <Descriptions.Item label="Tugash sanasi">{group.endDate ? formatDate(group.endDate) : '—'}</Descriptions.Item>
          <Descriptions.Item label="Status">{STATUS_LABELS[group.status]}</Descriptions.Item>
          <Descriptions.Item label="Kurs">
            <Typography.Link onClick={() => navigate(`/courses/${group.course.id}`)}>
              {group.course.name} ({group.course.code})
            </Typography.Link>
          </Descriptions.Item>
          <Descriptions.Item label="Filial">
            <Typography.Link onClick={() => navigate(`/branches/${group.branch.id}`)}>{group.branch.name}</Typography.Link>
          </Descriptions.Item>
          <Descriptions.Item label="Xona">
            {group.classroom ? (
              <Typography.Link onClick={() => navigate(`/classrooms/${group.classroom!.id}`)}>
                {group.classroom.name} ({group.classroom.roomNumber})
              </Typography.Link>
            ) : (
              '—'
            )}
          </Descriptions.Item>
          {group.notes && (
            <Descriptions.Item label="Izoh" span={2}>
              {group.notes}
            </Descriptions.Item>
          )}
        </Descriptions>
      ),
    },
    {
      key: 'students',
      label: `O'quvchilar (${group.enrollments.length})`,
      children: group.enrollments.length ? (
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={group.enrollments}
          columns={[
            { title: 'Kod', render: (_, record) => record.student.studentCode },
            {
              title: 'F.I.Sh.',
              render: (_, record) => <Typography.Link onClick={() => navigate(`/students/${record.student.id}`)}>{record.student.fullName}</Typography.Link>,
            },
            { title: 'Boshlanish', dataIndex: 'startDate', render: (v: string) => formatDate(v) },
            { title: "Kelishilgan to'lov", dataIndex: 'agreedTuition', render: (v: string | null) => (v ? formatNumber(v, 2) : '—') },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (v: EnrollmentStatus) => <Tag color={ENROLLMENT_STATUS_COLORS[v]}>{v}</Tag>,
            },
            {
              title: 'Amallar',
              render: (_, record) => (
                <Button size="small" onClick={() => navigate(`/enrollments/${record.id}`)}>
                  Ochish
                </Button>
              ),
            },
          ]}
        />
      ) : (
        <EmptyState title="Hali hech kim yozilmagan" />
      ),
    },
    {
      key: 'teacher',
      label: "O'qituvchi",
      children: group.teacherEmployee ? (
        <Descriptions column={1}>
          <Descriptions.Item label="F.I.Sh.">
            <Typography.Link onClick={() => navigate(`/teachers?search=${encodeURIComponent(group.teacherEmployee!.fullName)}`)}>
              {group.teacherEmployee.fullName}
            </Typography.Link>
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <EmptyState title="O'qituvchi tayinlanmagan" />
      ),
    },
    {
      key: 'schedule',
      label: `Dars jadvali (${schedulesQuery.data?.items.length ?? 0})`,
      children: schedulesQuery.isLoading ? (
        <Spin />
      ) : (
        <div>
          <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text type="secondary">Ushbu guruhning haftalik takrorlanuvchi dars jadvali. Har bir jadval — bir hafta kuni + vaqt oralig'i.</Typography.Text>
            {canCreateSchedule && (
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingSchedule(undefined);
                  setScheduleFormOpen(true);
                }}
              >
                Yangi jadval
              </Button>
            )}
          </Space>
          {schedulesQuery.data?.items.length ? (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={schedulesQuery.data.items}
              columns={[
                { title: 'Hafta kuni', dataIndex: 'dayOfWeek', render: (v: ScheduleDayOfWeek) => DAY_LABELS[v] },
                { title: 'Vaqti', render: (_, record) => `${record.startTime}–${record.endTime}` },
                { title: "O'qituvchi", render: (_, record) => record.teacherEmployee?.fullName ?? '—' },
                { title: 'Xona', render: (_, record) => record.classroom?.name ?? '—' },
                { title: 'Status', dataIndex: 'status', render: (v: ScheduleStatus) => <Tag color={SCHEDULE_STATUS_COLORS[v]}>{SCHEDULE_STATUS_LABELS[v]}</Tag> },
                {
                  title: 'Amallar',
                  render: (_, record) => (
                    <Space>
                      {canEditSchedule && record.status === 'ACTIVE' && (
                        <Button size="small" icon={<ThunderboltOutlined />} onClick={() => setGenerateFor(record)}>
                          Darslarni yaratish
                        </Button>
                      )}
                      {canEditSchedule && (
                        <Button
                          size="small"
                          onClick={() => {
                            setEditingSchedule(record);
                            setScheduleFormOpen(true);
                          }}
                        >
                          Tahrirlash
                        </Button>
                      )}
                      {canDeleteSchedule && record.status !== 'CANCELLED' && (
                        <Popconfirm title="Dars jadvalini bekor qilishni tasdiqlaysizmi?" onConfirm={() => handleCancelSchedule(record)}>
                          <Button size="small" danger>
                            Bekor qilish
                          </Button>
                        </Popconfirm>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          ) : (
            <EmptyState title="Hali dars jadvali belgilanmagan" />
          )}
        </div>
      ),
    },
    canViewLessons && {
      key: 'lessons',
      label: 'Darslar',
      children: (
        <Table
          rowKey="id"
          size="small"
          loading={lessonsQuery.isLoading}
          dataSource={lessonsQuery.data?.items}
          pagination={false}
          onRow={(record) => ({ onClick: () => navigate(`/lessons/${record.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Sana', dataIndex: 'scheduledStart', render: (v: string) => formatDateTime(v) },
            { title: "O'qituvchi", render: (_, record) => record.teacherEmployee?.fullName ?? '—' },
            { title: 'Xona', render: (_, record) => record.classroom?.name ?? '—' },
            { title: 'Mavzu', dataIndex: 'topic', render: (v: string | null) => v ?? '—' },
            { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag color={LESSON_STATUS_COLORS[v]}>{LESSON_STATUS_LABELS[v] ?? v}</Tag> },
          ]}
        />
      ),
    },
    canViewAttendance && {
      key: 'attendance',
      label: 'Davomat',
      children: attendanceSummaryQuery.isLoading ? (
        <Spin />
      ) : attendanceSummaryQuery.isError ? (
        <PageErrorState onRetry={() => attendanceSummaryQuery.refetch()} />
      ) : !attendanceSummaryQuery.data ? null : (
        <>
          <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
            <Col>
              <DatePicker.RangePicker
                onChange={(range) => setAttendanceDateRange(range && range[0] && range[1] ? [range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')] : undefined)}
              />
            </Col>
            <Col>
              <Button icon={<DownloadOutlined />} onClick={handleExportAttendance}>
                CSV yuklash
              </Button>
            </Col>
          </Row>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Statistic title="Jami darslar" value={attendanceSummaryQuery.data.totalLessons} />
            </Col>
            <Col span={8}>
              <Statistic title="O'quvchilar soni" value={attendanceSummaryQuery.data.students.length} />
            </Col>
            <Col span={8}>
              <Statistic title="O'rtacha davomat" value={groupAverageAttendance} suffix="%" />
            </Col>
          </Row>
          <Table<GroupAttendanceStudentRow>
            size="small"
            rowKey={(record) => record.student.id}
            dataSource={attendanceSummaryQuery.data.students}
            pagination={false}
            onRow={(record) => ({ onClick: () => navigate(`/students/${record.student.id}?tab=attendance`), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Kod', render: (_, record) => record.student.studentCode },
              { title: "F.I.Sh.", render: (_, record) => record.student.fullName },
              { title: 'Jami', dataIndex: 'eligibleLessons' },
              { title: 'Keldi', dataIndex: 'present' },
              { title: 'Kelmadi', dataIndex: 'absent' },
              { title: 'Kech qoldi', dataIndex: 'late' },
              { title: 'Sababli', dataIndex: 'excused' },
              { title: 'Belgilanmagan', dataIndex: 'unmarked' },
              {
                title: 'Davomat foizi',
                dataIndex: 'attendancePercentage',
                render: (v: number) => <Progress percent={v} size="small" status={v < 50 ? 'exception' : undefined} style={{ width: 140 }} />,
              },
            ]}
          />
        </>
      ),
    },
    canViewResults && {
      key: 'results',
      label: 'Akademik natijalar',
      children: resultsQuery.isLoading ? (
        <Spin />
      ) : resultsQuery.isError ? (
        <PageErrorState onRetry={() => resultsQuery.refetch()} />
      ) : !resultsQuery.data ? null : resultsQuery.data.exams.length ? (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Statistic title="Jami imtihonlar" value={resultsQuery.data.exams.length} />
            </Col>
            <Col span={8}>
              <Statistic title="Umumiy o'rtacha ball" value={resultsQuery.data.overallAverage} suffix="%" />
            </Col>
            <Col span={8}>
              <Statistic title="Umumiy o'tish darajasi" value={resultsQuery.data.overallPassRate} suffix="%" />
            </Col>
          </Row>
          <Table
            size="small"
            rowKey="examId"
            dataSource={resultsQuery.data.exams}
            pagination={false}
            onRow={(record) => ({ onClick: () => navigate(`/exams/${record.examId}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Imtihon', dataIndex: 'title' },
              { title: 'Sana', dataIndex: 'date', render: (v: string) => formatDate(v) },
              { title: 'Baholangan', render: (_, record) => `${record.assessedCount} / ${record.totalEnrolled}` },
              { title: "O'rtacha", dataIndex: 'average', render: (v: number) => `${v}%` },
              { title: "O'tish darajasi", dataIndex: 'passRate', render: (v: number) => `${v}%` },
            ]}
          />
        </>
      ) : (
        <EmptyState title="Hali imtihon natijalari yo'q" />
      ),
    },
  ].filter((tab): tab is Exclude<typeof tab, false> => Boolean(tab));

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/groups')} style={{ marginBottom: 8 }}>
        Guruhlar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {group.name} <Tag>{group.code}</Tag>
            </Typography.Title>
            <Space size={12} wrap>
              <Typography.Text type="secondary">{group.course.name}</Typography.Text>
              <Typography.Text type="secondary">&middot; {group.branch.name}</Typography.Text>
              {group.teacherEmployee && <Typography.Text type="secondary">&middot; {group.teacherEmployee.fullName}</Typography.Text>}
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Tag color={STATUS_COLORS[group.status]}>{STATUS_LABELS[group.status]}</Tag>
              {canEnroll && group.availableSeats > 0 && (
                <Button icon={<UserAddOutlined />} onClick={() => setEnrollOpen(true)}>
                  O'quvchi yozish
                </Button>
              )}
              {canEdit && (
                <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                  Tahrirlash
                </Button>
              )}
              {canEdit && group.status !== 'CANCELLED' && (
                <Popconfirm title="Guruhni bekor qilishni tasdiqlaysizmi?" onConfirm={() => deactivateMutation.mutate()}>
                  <Button loading={deactivateMutation.isPending} danger icon={<StopOutlined />}>
                    Bekor qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>

        <Row gutter={24} style={{ marginTop: 20 }} align="middle">
          <Col xs={24} sm={10}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              To'ldirilganlik: {group.enrolledCount} / {group.capacity}
            </Typography.Text>
            <Progress
              percent={group.capacity > 0 ? Math.round((group.enrolledCount / group.capacity) * 100) : 0}
              status={group.availableSeats === 0 ? 'exception' : 'active'}
              strokeColor={group.availableSeats === 0 ? palette.error : palette.primary}
            />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic title="Bo'sh o'rinlar" value={group.availableSeats} styles={{ content: { color: group.availableSeats > 0 ? palette.success : palette.error, fontSize: 20 } }} />
          </Col>
          <Col xs={12} sm={9}>
            <Statistic
              title="To'lov"
              value={group.tuitionAmount ? Number(group.tuitionAmount) : 0}
              formatter={(v) => formatCurrency(Number(v))}
              styles={{ content: { fontSize: 20 } }}
            />
          </Col>
        </Row>
      </Card>

      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs} />
      </Card>

      <GroupFormModal open={editOpen} onClose={() => setEditOpen(false)} group={group} />
      <EnrollmentFormModal open={enrollOpen} onClose={() => setEnrollOpen(false)} defaultGroupId={group.id} />
      <ScheduleFormModal
        open={scheduleFormOpen}
        onClose={() => setScheduleFormOpen(false)}
        schedule={editingSchedule}
        defaultGroupId={editingSchedule ? undefined : group.id}
      />
      {generateFor && <GenerateLessonsModal open={!!generateFor} onClose={() => setGenerateFor(undefined)} schedule={generateFor} />}
    </div>
  );
}
