import { ArrowLeftOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Avatar, Button, Card, Col, Descriptions, Empty, Popconfirm, Row, Space, Spin, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { listEnrollments } from '../../api/enrollments';
import { listPayroll } from '../../api/payroll';
import { listSchedules } from '../../api/schedules';
import { getAttendanceSummary } from '../../api/studentAttendance';
import { deactivateTeacher, getTeacher, getTeacherCompensationPreview } from '../../api/teachers';
import { PageErrorState } from '../../components/PageErrorState';
import { avatarColor } from '../../utils/avatarColor';
import { StatusTag } from '../../components/StatusTag';
import { TeacherFormModal } from '../../components/TeacherFormModal';
import { useAuthStore } from '../../store/auth.store';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';
import type { ScheduleDayOfWeek, SalaryType, StudentGroupStatus, TeacherProfileStatus } from '../../types';

const STATUS_COLORS: Record<TeacherProfileStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };
const STATUS_LABELS: Record<TeacherProfileStatus, string> = { ACTIVE: 'Faol', INACTIVE: 'Nofaol' };
const GROUP_STATUS_COLORS: Record<StudentGroupStatus, string> = { PLANNED: 'default', ACTIVE: 'green', PAUSED: 'gold', COMPLETED: 'blue', CANCELLED: 'red' };
const DAY_LABELS: Record<ScheduleDayOfWeek, string> = {
  MONDAY: 'Dushanba',
  TUESDAY: 'Seshanba',
  WEDNESDAY: 'Chorshanba',
  THURSDAY: 'Payshanba',
  FRIDAY: 'Juma',
  SATURDAY: 'Shanba',
  SUNDAY: 'Yakshanba',
};
const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  HOURLY: 'Soatbay',
  DAILY: 'Kunlik',
  MONTHLY: 'Oylik (fiksed)',
  PER_LESSON: 'Dars uchun',
  PER_GROUP: 'Guruh uchun',
  MIXED: 'Aralash',
};

export function TeacherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [editOpen, setEditOpen] = useState(false);

  const activeTab = searchParams.get('tab') ?? 'overview';
  const setActiveTab = (key: string) => setSearchParams(key === 'overview' ? {} : { tab: key }, { replace: true });

  const canEdit = hasPermission('teachers', 'EDIT');
  const canViewCompensation = hasPermission('compensation', 'VIEW');
  const canViewPayroll = hasPermission('payroll', 'VIEW');
  const canViewSchedules = hasPermission('schedules', 'VIEW');
  const canViewAttendance = hasPermission('student_attendance', 'VIEW');
  const canViewStudents = hasPermission('enrollments', 'VIEW');

  const teacherQuery = useQuery({ queryKey: ['teacher', id], queryFn: () => getTeacher(id!), enabled: !!id });
  const employeeId = teacherQuery.data?.employeeId;

  const studentsQuery = useQuery({
    queryKey: ['enrollments', { teacherEmployeeId: employeeId, forTeacherTab: true }],
    queryFn: () => listEnrollments({ teacherEmployeeId: employeeId, status: 'ACTIVE', pageSize: 100 }),
    enabled: !!employeeId && canViewStudents && activeTab === 'students',
  });
  const scheduleQuery = useQuery({
    queryKey: ['schedules', { teacherEmployeeId: employeeId, forTeacherTab: true }],
    queryFn: () => listSchedules({ teacherEmployeeId: employeeId, pageSize: 100 }),
    enabled: !!employeeId && canViewSchedules && activeTab === 'schedule',
  });
  const attendanceQuery = useQuery({
    queryKey: ['attendance-summary', { teacherEmployeeId: employeeId, forTeacherTab: true }],
    queryFn: () => getAttendanceSummary({ teacherEmployeeId: employeeId }),
    enabled: !!employeeId && canViewAttendance && activeTab === 'attendance',
  });
  const compensationQuery = useQuery({
    queryKey: ['teacher-compensation', id],
    queryFn: () => getTeacherCompensationPreview(id!),
    enabled: !!id && canViewCompensation && activeTab === 'compensation',
  });
  const payrollQuery = useQuery({
    queryKey: ['payroll', { employeeId, forTeacherTab: true }],
    queryFn: () => listPayroll({ employeeId, pageSize: 20 }),
    enabled: !!employeeId && canViewPayroll && activeTab === 'payroll',
  });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateTeacher(id!),
    onSuccess: () => {
      message.success("O'qituvchi profili nofaol qilindi");
      queryClient.invalidateQueries({ queryKey: ['teacher', id] });
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Amalni bajarib bo'lmadi");
    },
  });

  if (teacherQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (teacherQuery.isError) {
    return <PageErrorState onRetry={() => teacherQuery.refetch()} />;
  }

  const teacher = teacherQuery.data;
  if (!teacher) return null;

  const tabs = [
    {
      key: 'overview',
      label: 'Umumiy',
      children: (
        <>
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} title="Xodim ma'lumotlari">
            <Descriptions.Item label="Telefon">{teacher.employee.phone}</Descriptions.Item>
            <Descriptions.Item label="Email">{teacher.employee.email ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Bo'lim">{teacher.employee.department?.name ?? '—'}</Descriptions.Item>
          </Descriptions>

          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }} title="O'qituvchi profili">
            <Descriptions.Item label="Malaka">{teacher.qualification ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Tajriba">{teacher.experienceYears !== null ? `${teacher.experienceYears} yil` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Soatlik stavka">{teacher.hourlyRate ? formatNumber(teacher.hourlyRate, 2) : '—'}</Descriptions.Item>
            {teacher.bio && (
              <Descriptions.Item label="Bio" span={3}>
                {teacher.bio}
              </Descriptions.Item>
            )}
          </Descriptions>

          <Row gutter={16} style={{ marginTop: 24 }}>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Faol guruhlar" value={teacher.workload.activeGroupsCount} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Faol o'quvchilar" value={teacher.workload.activeStudentsCount} styles={{ content: { color: '#3f8600' } }} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Jami o'quvchilar (tarixiy)" value={teacher.workload.totalEnrolledStudents} />
              </Card>
            </Col>
          </Row>
        </>
      ),
    },
    {
      key: 'groups',
      label: `Guruhlar (${teacher.groups.length})`,
      children: teacher.groups.length ? (
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={teacher.groups}
          onRow={(record) => ({ onClick: () => navigate(`/groups/${record.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Nomi', dataIndex: 'name' },
            { title: 'Kurs', render: (_, record) => record.course.name },
            { title: 'Filial', render: (_, record) => record.branch.name },
            { title: "O'quvchilar", render: (_, record) => `${record.enrolledCount}/${record.capacity}` },
            { title: 'Boshlanish', dataIndex: 'startDate', render: (v: string) => formatDate(v) },
            { title: 'Status', dataIndex: 'status', render: (v: StudentGroupStatus) => <Tag color={GROUP_STATUS_COLORS[v]}>{v}</Tag> },
          ]}
        />
      ) : (
        <Empty description="Hali guruh tayinlanmagan" />
      ),
    },
    canViewStudents && {
      key: 'students',
      label: "O'quvchilar",
      children: (
        <Table
          rowKey="id"
          size="small"
          loading={studentsQuery.isLoading}
          dataSource={studentsQuery.data?.items}
          pagination={false}
          onRow={(record) => ({ onClick: () => navigate(`/students/${record.student.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Kod', render: (_, record) => record.student.studentCode },
            { title: "F.I.Sh.", render: (_, record) => record.student.fullName },
            { title: 'Guruh', render: (_, record) => record.group.name },
            { title: 'Kurs', render: (_, record) => record.group.course.name },
          ]}
        />
      ),
    },
    canViewSchedules && {
      key: 'schedule',
      label: 'Dars jadvali',
      children: (
        <Table
          rowKey="id"
          size="small"
          loading={scheduleQuery.isLoading}
          dataSource={scheduleQuery.data?.items}
          pagination={false}
          onRow={(record) => ({ onClick: () => navigate(`/groups/${record.group.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Hafta kuni', dataIndex: 'dayOfWeek', render: (v: ScheduleDayOfWeek) => DAY_LABELS[v] },
            { title: 'Vaqti', render: (_, record) => `${record.startTime}–${record.endTime}` },
            { title: 'Guruh', render: (_, record) => record.group.name },
            { title: 'Xona', render: (_, record) => record.classroom?.name ?? '—' },
            { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag value={v} /> },
          ]}
        />
      ),
    },
    canViewAttendance && {
      key: 'attendance',
      label: 'Davomat',
      children: attendanceQuery.isLoading ? (
        <Spin />
      ) : attendanceQuery.isError ? (
        <PageErrorState onRetry={() => attendanceQuery.refetch()} />
      ) : !attendanceQuery.data ? null : (
        <Row gutter={16}>
          <Col span={4}>
            <Statistic title="Jami belgilangan" value={attendanceQuery.data.totalMarked} />
          </Col>
          <Col span={4}>
            <Statistic title="Keldi" value={attendanceQuery.data.present} styles={{ content: { color: '#3f8600' } }} />
          </Col>
          <Col span={4}>
            <Statistic title="Kelmadi" value={attendanceQuery.data.absent} styles={{ content: { color: '#cf1322' } }} />
          </Col>
          <Col span={4}>
            <Statistic title="Kech qoldi" value={attendanceQuery.data.late} styles={{ content: { color: '#d4b106' } }} />
          </Col>
          <Col span={4}>
            <Statistic title="Sababli" value={attendanceQuery.data.excused} styles={{ content: { color: '#1677ff' } }} />
          </Col>
          <Col span={4}>
            <Statistic title="Davomat foizi" value={attendanceQuery.data.markedAttendancePercentage} suffix="%" />
          </Col>
        </Row>
      ),
    },
    canViewCompensation && {
      key: 'compensation',
      label: 'Maosh',
      children: compensationQuery.isLoading ? (
        <Spin />
      ) : compensationQuery.isError ? (
        <PageErrorState onRetry={() => compensationQuery.refetch()} />
      ) : !compensationQuery.data ? null : (
        <>
          <Descriptions column={{ xs: 1, sm: 2 }} title="Joriy shartnoma" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Turi">
              {compensationQuery.data.currentCompensation ? SALARY_TYPE_LABELS[compensationQuery.data.currentCompensation.salaryType] : 'Belgilanmagan'}
            </Descriptions.Item>
            <Descriptions.Item label="Bazaviy summa">
              {compensationQuery.data.currentCompensation ? formatNumber(compensationQuery.data.currentCompensation.baseSalary, 2) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Soatlik stavka">{compensationQuery.data.rates.hourlyRate !== null ? formatNumber(compensationQuery.data.rates.hourlyRate, 2) : '—'}</Descriptions.Item>
            <Descriptions.Item label="Dars uchun stavka">
              {compensationQuery.data.rates.perLessonRate !== null ? formatNumber(compensationQuery.data.rates.perLessonRate, 2) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Guruh uchun stavka">
              {compensationQuery.data.rates.perGroupRate !== null ? formatNumber(compensationQuery.data.rates.perGroupRate, 2) : '—'}
            </Descriptions.Item>
          </Descriptions>

          <Typography.Paragraph type="secondary">
            Davr: {formatDate(compensationQuery.data.period.start)} — {formatDate(compensationQuery.data.period.end)}
          </Typography.Paragraph>

          <Row gutter={16}>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Yakunlangan darslar" value={compensationQuery.data.completedLessons} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Faol guruhlar" value={compensationQuery.data.activeGroups} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Darslar bo'yicha (taxminiy)"
                  value={compensationQuery.data.estimatedLessonPay ?? '—'}
                  precision={compensationQuery.data.estimatedLessonPay !== null ? 2 : undefined}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Guruhlar bo'yicha (taxminiy)"
                  value={compensationQuery.data.estimatedGroupPay ?? '—'}
                  precision={compensationQuery.data.estimatedGroupPay !== null ? 2 : undefined}
                />
              </Card>
            </Col>
          </Row>
        </>
      ),
    },
    canViewPayroll && {
      key: 'payroll',
      label: 'Ish haqi (Payroll)',
      children: (
        <Table
          rowKey="id"
          size="small"
          loading={payrollQuery.isLoading}
          dataSource={payrollQuery.data?.items}
          pagination={false}
          locale={{ emptyText: "Hali ish haqi hisoblanmagan" }}
          onRow={(record) => ({ onClick: () => navigate(`/payroll/${record.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Raqam', dataIndex: 'payrollNumber' },
            { title: 'Davr', render: (_, record) => record.period.name },
            { title: 'Jami (Gross)', dataIndex: 'grossSalary', render: (v: string) => formatCurrency(v) },
            { title: 'Ushlab qolish', dataIndex: 'deductionAmount', render: (v: string) => formatCurrency(v) },
            { title: 'Sof (Net)', dataIndex: 'netSalary', render: (v: string) => formatCurrency(v) },
            { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag value={v} /> },
          ]}
        />
      ),
    },
  ].filter((tab): tab is Exclude<typeof tab, false> => Boolean(tab));

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/teachers')} style={{ marginBottom: 8 }}>
        O'qituvchilar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space size={16} align="center">
              <Avatar size={48} style={{ background: avatarColor(teacher.employee.fullName), fontSize: 18, flexShrink: 0 }}>
                {teacher.employee.fullName.charAt(0)}
              </Avatar>
              <div>
                <Typography.Title level={3} style={{ margin: 0 }}>
                  {teacher.employee.fullName}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {teacher.employee.employeeCode} · {teacher.specialization ?? "Mutaxassisligi ko'rsatilmagan"}
                </Typography.Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Tag color={STATUS_COLORS[teacher.status]}>{STATUS_LABELS[teacher.status]}</Tag>
              {canEdit && (
                <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                  Tahrirlash
                </Button>
              )}
              {canEdit && teacher.status !== 'INACTIVE' && (
                <Popconfirm title="O'qituvchi profilini nofaol qilishni tasdiqlaysizmi?" onConfirm={() => deactivateMutation.mutate()}>
                  <Button loading={deactivateMutation.isPending} danger icon={<StopOutlined />}>
                    Nofaol qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs} />
      </Card>

      <TeacherFormModal open={editOpen} onClose={() => setEditOpen(false)} teacher={teacher} />
    </div>
  );
}
