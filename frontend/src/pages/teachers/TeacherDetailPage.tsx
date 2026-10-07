import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  GroupOutlined,
  InfoCircleOutlined,
  PercentageOutlined,
  StopOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Avatar, Button, Card, Descriptions, Popconfirm, Spin, Table, Tabs, Tag } from 'antd';
import { EmptyState } from '../../components/EmptyState';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { listEnrollments } from '../../api/enrollments';
import { listSchedules } from '../../api/schedules';
import { getAttendanceSummary } from '../../api/studentAttendance';
import { createTeacherAccount, deactivateTeacher, getTeacher, getTeacherAccount, resetTeacherPassword, setTeacherAccountActive, deleteTeacherAccount } from '../../api/teachers';
import { ActionBar } from '../../components/ActionBar';
import { DetailHeader } from '../../components/DetailHeader';
import { PageErrorState } from '../../components/PageErrorState';
import { SummaryCard } from '../../components/SummaryCard';
import { avatarColor } from '../../utils/avatarColor';
import { StatusTag } from '../../components/StatusTag';
import { LoginAccountCard } from '../../components/LoginAccountCard';
import { TeacherFormModal } from '../../components/TeacherFormModal';
import { palette } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { formatDate } from '../../utils/format';
import type { ScheduleDayOfWeek, StudentGroupStatus, TeacherProfileStatus } from '../../types';

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
          <LoginAccountCard
            ownerLabel="O'qituvchi"
            emptyText="O'qituvchining tizimga kirish logini yo'q. Login yaratsangiz, u o'z guruhlari, davomat, uy ishi va testlar bilan ishlay oladi."
            queryKey={['teacher-account', teacher.id]}
            editPermission={{ module: 'teachers', action: 'EDIT' }}
            fetchAccount={() => getTeacherAccount(teacher.id)}
            createAccount={() => createTeacherAccount(teacher.id)}
            resetPassword={() => resetTeacherPassword(teacher.id)}
            setActive={(active) => setTeacherAccountActive(teacher.id, active)}
            deleteAccount={() => deleteTeacherAccount(teacher.id)}
          />
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} title="Aloqa">
            <Descriptions.Item label="Telefon">{teacher.employee.phone}</Descriptions.Item>
            <Descriptions.Item label="Email">{teacher.employee.email ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Ishga kirgan">{formatDate(teacher.employee.hireDate)}</Descriptions.Item>
          </Descriptions>

          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }} title="O'qituvchi profili">
            <Descriptions.Item label="Malaka">{teacher.qualification ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Tajriba">{teacher.experienceYears !== null ? `${teacher.experienceYears} yil` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Mutaxassislik">{teacher.specialization ?? '—'}</Descriptions.Item>
            {teacher.bio && (
              <Descriptions.Item label="Bio" span={3}>
                {teacher.bio}
              </Descriptions.Item>
            )}
          </Descriptions>

          <div style={{ marginTop: 24 }}>
            <SummaryCard
              items={[
                { icon: <GroupOutlined />, label: 'Faol guruhlar', value: teacher.workload.activeGroupsCount, color: palette.primary },
                { icon: <TeamOutlined />, label: "Faol o'quvchilar", value: teacher.workload.activeStudentsCount, color: palette.success },
                { icon: <TeamOutlined />, label: "Jami o'quvchilar (tarixiy)", value: teacher.workload.totalEnrolledStudents, color: palette.info },
              ]}
            />
          </div>
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
        <EmptyState title="Hali guruh tayinlanmagan" />
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
        <SummaryCard
          items={[
            { icon: <CalendarOutlined />, label: 'Jami belgilangan', value: attendanceQuery.data.totalMarked, color: palette.info },
            { icon: <CheckCircleOutlined />, label: 'Keldi', value: attendanceQuery.data.present, color: palette.success },
            { icon: <CloseCircleOutlined />, label: 'Kelmadi', value: attendanceQuery.data.absent, color: palette.error },
            { icon: <ClockCircleOutlined />, label: 'Kech qoldi', value: attendanceQuery.data.late, color: palette.warning },
            { icon: <InfoCircleOutlined />, label: 'Sababli', value: attendanceQuery.data.excused, color: palette.info },
            {
              icon: <PercentageOutlined />,
              label: 'Davomat foizi',
              value: attendanceQuery.data.markedAttendancePercentage,
              suffix: '%',
              color:
                attendanceQuery.data.markedAttendancePercentage >= 80
                  ? palette.success
                  : attendanceQuery.data.markedAttendancePercentage >= 50
                    ? palette.warning
                    : palette.error,
            },
          ]}
        />
      ),
    },
  ].filter((tab): tab is Exclude<typeof tab, false> => Boolean(tab));

  return (
    <div>
      <DetailHeader
        backLabel="O'qituvchilar ro'yxatiga qaytish"
        onBack={() => navigate('/teachers')}
        avatar={
          <Avatar size={48} style={{ background: avatarColor(teacher.employee.fullName), fontSize: 18, flexShrink: 0 }}>
            {teacher.employee.fullName.charAt(0)}
          </Avatar>
        }
        title={teacher.employee.fullName}
        subtitle={
          <>
            {teacher.employee.employeeCode} · {teacher.specialization ?? "Mutaxassisligi ko'rsatilmagan"}
          </>
        }
        actions={
          <ActionBar>
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
          </ActionBar>
        }
      />

      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs} />
      </Card>

      <TeacherFormModal open={editOpen} onClose={() => setEditOpen(false)} teacher={teacher} />
    </div>
  );
}
