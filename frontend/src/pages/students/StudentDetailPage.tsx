import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  DownloadOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FormOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  PauseCircleOutlined,
  PercentageOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  StarFilled,
  StarOutlined,
  StopOutlined,
  SwapOutlined,
  TagOutlined,
  TrophyOutlined,
  UserAddOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Avatar, Button, Card, Col, DatePicker, Descriptions, Popconfirm, Progress, Row, Select, Space, Spin, Table, Tabs, Tag, Typography } from 'antd';
import { EmptyState } from '../../components/EmptyState';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { listAuditLogs, type AuditLogEntry } from '../../api/auditLog';
import { revokeStudentDiscount } from '../../api/discounts';
import { activateEnrollment, pauseEnrollment } from '../../api/enrollments';
import { listGroups } from '../../api/groups';
import { deactivateStudent, getStudent, getStudentGrades, getStudentProgress, removeStudentGuardian, updateStudentGuardianLink } from '../../api/students';
import { downloadStudentAttendanceCsv, getStudentAttendanceHistory } from '../../api/studentAttendance';
import { getStudentFinancialSummary } from '../../api/tuition';
import { ActionBar } from '../../components/ActionBar';
import { CreateTuitionChargeModal } from '../../components/CreateTuitionChargeModal';
import { DetailHeader } from '../../components/DetailHeader';
import { EnrollmentFormModal } from '../../components/EnrollmentFormModal';
import { GrantDiscountModal } from '../../components/GrantDiscountModal';
import { LinkGuardianModal } from '../../components/LinkGuardianModal';
import { PageErrorState } from '../../components/PageErrorState';
import { SummaryCard } from '../../components/SummaryCard';
import { avatarColor } from '../../utils/avatarColor';
import { StatusTag } from '../../components/StatusTag';
import { StudentFormModal } from '../../components/StudentFormModal';
import { TransferEnrollmentModal } from '../../components/TransferEnrollmentModal';
import { palette } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../utils/format';
import { ATTENDANCE_STATUS_COLORS, ATTENDANCE_STATUS_LABELS } from '../../utils/attendanceStatus';
import type { EnrollmentStatus, ExamType, StudentAttendanceHistoryRecord, StudentEnrollmentItem, StudentStatus, TuitionChargeStatus } from '../../types';

const STATUS_COLORS: Record<StudentStatus, string> = { ACTIVE: 'green', PAUSED: 'gold', GRADUATED: 'blue', INACTIVE: 'default', LEFT: 'red' };
const STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'Faol',
  PAUSED: 'Muzlatilgan',
  GRADUATED: 'Bitirgan',
  INACTIVE: 'Nofaol',
  LEFT: "Chiqib ketgan",
};
const ENROLLMENT_STATUS_COLORS: Record<EnrollmentStatus, string> = { ACTIVE: 'green', PAUSED: 'gold', COMPLETED: 'blue', CANCELLED: 'red', TRANSFERRED: 'purple' };
const TUITION_STATUS_COLORS: Record<TuitionChargeStatus, string> = { PENDING: 'blue', PARTIALLY_PAID: 'orange', PAID: 'green', OVERDUE: 'red', CANCELLED: 'default' };
const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  QUIZ: 'Test',
  MIDTERM: 'Oraliq nazorat',
  FINAL: 'Yakuniy nazorat',
  MOCK: 'Sinov imtihoni',
  PLACEMENT: 'Daraja aniqlash',
  OTHER: 'Boshqa',
};

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<StudentEnrollmentItem | undefined>();
  const [chargeModalOpen, setChargeModalOpen] = useState(false);
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [attendanceGroupId, setAttendanceGroupId] = useState<string | undefined>();
  const [attendanceDateRange, setAttendanceDateRange] = useState<[string, string] | undefined>();

  const activeTab = searchParams.get('tab') ?? 'overview';
  const setActiveTab = (key: string) => setSearchParams(key === 'overview' ? {} : { tab: key }, { replace: true });

  const canEdit = hasPermission('students', 'EDIT');
  const canViewAttendance = hasPermission('student_attendance', 'VIEW');
  const canViewFinance = hasPermission('tuition', 'VIEW');
  const canViewGrades = hasPermission('grades', 'VIEW');
  const canViewProgress = hasPermission('exams', 'VIEW');
  const canViewHistory = hasPermission('audit_logs', 'VIEW');
  const canGroups = hasPermission('groups', 'VIEW');

  const studentQuery = useQuery({ queryKey: ['student', id], queryFn: () => getStudent(id!), enabled: !!id });

  // Every heavier per-tab query is `enabled` only while that tab is active — a
  // student profile with 8 tabs must not fire 8 requests just to view one.
  const groupsQuery = useQuery({
    queryKey: ['groups', { pageSize: 100, forAttendanceFilter: true }],
    queryFn: () => listGroups({ pageSize: 100 }),
    enabled: canGroups && activeTab === 'attendance',
  });
  const attendanceHistoryQuery = useQuery({
    queryKey: ['student-attendance-history', id, { attendanceGroupId, attendanceDateRange }],
    queryFn: () => getStudentAttendanceHistory(id!, { groupId: attendanceGroupId, dateFrom: attendanceDateRange?.[0], dateTo: attendanceDateRange?.[1] }),
    enabled: !!id && activeTab === 'attendance',
  });
  const financeSummaryQuery = useQuery({
    queryKey: ['student-financial-summary', id],
    queryFn: () => getStudentFinancialSummary(id!),
    enabled: !!id && activeTab === 'finance',
  });
  const gradesQuery = useQuery({ queryKey: ['student-grades', id], queryFn: () => getStudentGrades(id!), enabled: !!id && activeTab === 'grades' });
  const progressQuery = useQuery({ queryKey: ['student-progress', id], queryFn: () => getStudentProgress(id!), enabled: !!id && activeTab === 'progress' });
  const historyQuery = useQuery({
    queryKey: ['audit-logs', 'Student', id],
    queryFn: () => listAuditLogs(1, 50, { entityType: 'Student', entityId: id }),
    enabled: !!id && activeTab === 'history',
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['student', id] });
    queryClient.invalidateQueries({ queryKey: ['students'] });
    queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    queryClient.invalidateQueries({ queryKey: ['group'] });
    queryClient.invalidateQueries({ queryKey: ['groups'] });
  }

  const pauseMutation = useMutation({
    mutationFn: (enrollmentId: string) => pauseEnrollment(enrollmentId),
    onSuccess: () => {
      message.success('Yozilish muzlatildi');
      invalidate();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Amalni bajarib bo'lmadi");
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (enrollmentId: string) => activateEnrollment(enrollmentId),
    onSuccess: () => {
      message.success('Yozilish tiklandi');
      invalidate();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Amalni bajarib bo'lmadi");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateStudent(id!),
    onSuccess: () => {
      message.success("O'quvchi nofaol qilindi");
      invalidate();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Amalni bajarib bo'lmadi");
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (guardianId: string) => updateStudentGuardianLink(id!, guardianId, { isPrimary: true }),
    onSuccess: () => {
      message.success('Asosiy vasiy belgilandi');
      invalidate();
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (guardianId: string) => removeStudentGuardian(id!, guardianId),
    onSuccess: () => {
      message.success("Vasiy bog'lanishi bekor qilindi");
      invalidate();
    },
  });

  const revokeDiscountMutation = useMutation({
    mutationFn: (studentDiscountId: string) => revokeStudentDiscount(id!, studentDiscountId),
    onSuccess: () => {
      message.success('Chegirma bekor qilindi');
      queryClient.invalidateQueries({ queryKey: ['student-financial-summary', id] });
    },
  });

  async function handleExportAttendance() {
    try {
      await downloadStudentAttendanceCsv(id!, { groupId: attendanceGroupId, dateFrom: attendanceDateRange?.[0], dateTo: attendanceDateRange?.[1] });
    } catch {
      message.error("Hisobotni yuklab bo'lmadi");
    }
  }

  if (studentQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (studentQuery.isError) {
    return <PageErrorState onRetry={() => studentQuery.refetch()} />;
  }

  const student = studentQuery.data;
  if (!student) return null;

  const canManageDiscounts = hasPermission('discounts', 'CREATE');
  const canRevokeDiscount = hasPermission('discounts', 'DELETE');
  const canCreateCharge = hasPermission('tuition', 'CREATE');

  const tabs = [
    {
      key: 'overview',
      label: 'Umumiy',
      children: (
        <>
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} title="Shaxsiy ma'lumotlar">
            <Descriptions.Item label="Telefon">{student.phone ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Email">{student.email ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Tug'ilgan sana">{formatDate(student.dateOfBirth)}</Descriptions.Item>
            <Descriptions.Item label="Jinsi">{student.gender ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Favqulodda aloqa">{student.emergencyContact ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Manzil">{student.address ?? '—'}</Descriptions.Item>
          </Descriptions>

          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }} title="Ro'yxat ma'lumotlari">
            <Descriptions.Item label="Ro'yxatga olingan sana">{formatDate(student.registrationDate)}</Descriptions.Item>
            <Descriptions.Item label="Qayerdan bilgan">{student.source ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Tizim foydalanuvchisi">{student.user ? `${student.user.username} (${student.user.status})` : "Bog'lanmagan"}</Descriptions.Item>
            <Descriptions.Item label="Joriy guruh(lar)" span={3}>
              {student.enrollments.filter((e) => e.status === 'ACTIVE').length ? (
                <Space wrap>
                  {student.enrollments
                    .filter((e) => e.status === 'ACTIVE')
                    .map((e) => (
                      <Tag key={e.id} color="green" style={{ cursor: 'pointer' }} onClick={() => navigate(`/groups/${e.group.id}`)}>
                        {e.group.name} ({e.group.course.name})
                      </Tag>
                    ))}
                </Space>
              ) : (
                '—'
              )}
            </Descriptions.Item>
            {student.convertedFromLead && (
              <Descriptions.Item label="Konvertatsiya qilingan lid" span={3}>
                {student.convertedFromLead.fullName} ({formatDate(student.convertedFromLead.createdAt)} sanasida lid sifatida yaratilgan)
              </Descriptions.Item>
            )}
            {student.notes && (
              <Descriptions.Item label="Izoh" span={3}>
                {student.notes}
              </Descriptions.Item>
            )}
          </Descriptions>
        </>
      ),
    },
    {
      key: 'guardians',
      label: `Vasiylar (${student.guardians.length})`,
      children: (
        <>
          {canEdit && (
            <Button icon={<LinkOutlined />} style={{ marginBottom: 12 }} onClick={() => setLinkOpen(true)}>
              Vasiy bog'lash
            </Button>
          )}
          {student.guardians.length ? (
            <Table
              rowKey="guardianId"
              size="small"
              pagination={false}
              dataSource={student.guardians}
              onRow={(record) => ({ onClick: () => navigate(`/guardians/${record.guardianId}`), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'F.I.Sh.', render: (_, record) => record.guardian.fullName },
                { title: 'Telefon', render: (_, record) => record.guardian.phone },
                { title: "Qarindoshlik", dataIndex: 'relationship' },
                {
                  title: 'Asosiymi',
                  render: (_, record) =>
                    record.isPrimary ? (
                      <Tag icon={<StarFilled />} color="gold">
                        Asosiy
                      </Tag>
                    ) : (
                      canEdit && (
                        <Button
                          size="small"
                          icon={<StarOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrimaryMutation.mutate(record.guardianId);
                          }}
                        >
                          Asosiy qilish
                        </Button>
                      )
                    ),
                },
                {
                  title: 'Amallar',
                  render: (_, record) =>
                    canEdit && (
                      <Popconfirm
                        title="Bog'lanishni bekor qilish?"
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          unlinkMutation.mutate(record.guardianId);
                        }}
                        onCancel={(e) => e?.stopPropagation()}
                      >
                        <Button loading={unlinkMutation.isPending} size="small" danger onClick={(e) => e.stopPropagation()}>
                          Bekor qilish
                        </Button>
                      </Popconfirm>
                    ),
                },
              ]}
            />
          ) : (
            <EmptyState title="Vasiylar bog'lanmagan" />
          )}
        </>
      ),
    },
    {
      key: 'enrollments',
      label: `Yozilishlar (${student.enrollments.length})`,
      children: (
        <>
          {hasPermission('enrollments', 'CREATE') && (
            <Button icon={<UserAddOutlined />} style={{ marginBottom: 12 }} onClick={() => setEnrollOpen(true)}>
              Guruhga yozish
            </Button>
          )}
          {student.enrollments.length ? (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={student.enrollments}
              onRow={(record) => ({ onClick: () => navigate(`/enrollments/${record.id}`), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'Kurs', render: (_, record) => record.group.course.name },
                { title: 'Guruh', render: (_, record) => record.group.name },
                { title: "O'qituvchi", render: (_, record) => record.group.teacherEmployee?.fullName ?? '—' },
                { title: 'Filial', render: (_, record) => record.group.branch.name },
                { title: 'Boshlanish sanasi', dataIndex: 'startDate', render: (v: string) => formatDate(v) },
                { title: "To'lov summasi", dataIndex: 'agreedTuition', render: (v: string | null) => (v ? formatNumber(v, 2) : '—') },
                { title: 'Chegirma', dataIndex: 'discountAmount', render: (v: string | null) => (v ? formatNumber(v, 2) : '—') },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  render: (v: EnrollmentStatus) => <Tag color={ENROLLMENT_STATUS_COLORS[v]}>{v}</Tag>,
                },
                {
                  title: 'Amallar',
                  render: (_, record) =>
                    hasPermission('enrollments', 'EDIT') && (
                      <Space onClick={(e) => e.stopPropagation()}>
                        {record.status === 'ACTIVE' && (
                          <Button size="small" icon={<PauseCircleOutlined />} onClick={() => pauseMutation.mutate(record.id)}>
                            Muzlatish
                          </Button>
                        )}
                        {record.status === 'PAUSED' && (
                          <Button size="small" icon={<PlayCircleOutlined />} onClick={() => resumeMutation.mutate(record.id)}>
                            Tiklash
                          </Button>
                        )}
                        {['ACTIVE', 'PAUSED'].includes(record.status) && (
                          <Button size="small" icon={<SwapOutlined />} onClick={() => setTransferTarget(record)}>
                            Ko'chirish
                          </Button>
                        )}
                      </Space>
                    ),
                },
              ]}
            />
          ) : (
            <EmptyState title="Yozilishlar yo'q" />
          )}
        </>
      ),
    },
    canViewAttendance && {
      key: 'attendance',
      label: 'Davomat',
      children: attendanceHistoryQuery.isLoading ? (
        <Spin />
      ) : (
        <>
          <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
            <Col />
            <Col>
              <Button icon={<DownloadOutlined />} onClick={handleExportAttendance}>
                CSV yuklash
              </Button>
            </Col>
          </Row>
          {attendanceHistoryQuery.data && (
            <SummaryCard
              items={[
                { icon: <CalendarOutlined />, label: 'Jami darslar', value: attendanceHistoryQuery.data.eligibleLessons, color: palette.info },
                { icon: <CheckCircleOutlined />, label: 'Keldi', value: attendanceHistoryQuery.data.present, color: palette.success },
                { icon: <CloseCircleOutlined />, label: 'Kelmadi', value: attendanceHistoryQuery.data.absent, color: palette.error },
                { icon: <ClockCircleOutlined />, label: 'Kech qoldi', value: attendanceHistoryQuery.data.late, color: palette.warning },
                { icon: <InfoCircleOutlined />, label: 'Sababli', value: attendanceHistoryQuery.data.excused, color: palette.info },
                {
                  icon: <PercentageOutlined />,
                  label: 'Davomat foizi',
                  value: attendanceHistoryQuery.data.attendancePercentage,
                  suffix: '%',
                  color:
                    attendanceHistoryQuery.data.attendancePercentage >= 80
                      ? palette.success
                      : attendanceHistoryQuery.data.attendancePercentage >= 50
                        ? palette.warning
                        : palette.error,
                },
              ]}
            />
          )}

          <Space style={{ marginBottom: 16 }} wrap>
            {canGroups && (
              <Select
                placeholder="Guruh bo'yicha"
                allowClear
                style={{ width: 200 }}
                options={groupsQuery.data?.items.map((g) => ({ value: g.id, label: g.name }))}
                onChange={setAttendanceGroupId}
              />
            )}
            <DatePicker.RangePicker
              onChange={(range) => setAttendanceDateRange(range && range[0] && range[1] ? [range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')] : undefined)}
            />
          </Space>

          <Table<StudentAttendanceHistoryRecord>
            rowKey="lessonId"
            size="small"
            dataSource={attendanceHistoryQuery.data?.records}
            pagination={{ pageSize: 20 }}
            columns={[
              { title: 'Sana', dataIndex: 'scheduledStart', render: (v: string) => formatDateTime(v) },
              { title: 'Guruh', render: (_, record) => record.group.name },
              { title: 'Mavzu', dataIndex: 'topic', render: (v: string | null) => v ?? '—' },
              {
                title: 'Status',
                dataIndex: 'status',
                render: (v: StudentAttendanceHistoryRecord['status']) =>
                  v === 'UNMARKED' ? <Tag>Belgilanmagan</Tag> : <Tag color={ATTENDANCE_STATUS_COLORS[v]}>{ATTENDANCE_STATUS_LABELS[v]}</Tag>,
              },
              { title: 'Izoh', dataIndex: 'notes', render: (v: string | null) => v ?? '—' },
            ]}
          />
        </>
      ),
    },
    canViewFinance && {
      key: 'finance',
      label: 'Moliya',
      children: financeSummaryQuery.isLoading ? (
        <Spin />
      ) : financeSummaryQuery.isError ? (
        <PageErrorState onRetry={() => financeSummaryQuery.refetch()} />
      ) : !financeSummaryQuery.data ? null : (
        <>
          <Row justify="end" style={{ marginBottom: 16 }}>
            <Space>
              {canManageDiscounts && (
                <Button icon={<PlusOutlined />} onClick={() => setGrantModalOpen(true)}>
                  Chegirma biriktirish
                </Button>
              )}
              {canCreateCharge && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setChargeModalOpen(true)}>
                  Yangi hisob
                </Button>
              )}
            </Space>
          </Row>

          <SummaryCard
            items={[
              { icon: <WalletOutlined />, label: 'Jami hisoblangan', value: financeSummaryQuery.data.balance.totalBilled, color: palette.info, formatter: (v) => formatCurrency(v) },
              { icon: <TagOutlined />, label: 'Chegirmalar', value: financeSummaryQuery.data.balance.discounts, color: palette.warning, formatter: (v) => formatCurrency(v) },
              { icon: <DollarOutlined />, label: "To'langan", value: financeSummaryQuery.data.balance.paid, color: palette.success, formatter: (v) => formatCurrency(v) },
              { icon: <WalletOutlined />, label: 'Qoldiq', value: financeSummaryQuery.data.balance.outstanding, color: palette.primary, formatter: (v) => formatCurrency(v) },
              {
                icon: <ExclamationCircleOutlined />,
                label: "Muddati o'tgan",
                value: financeSummaryQuery.data.balance.overdue,
                color: financeSummaryQuery.data.balance.overdue > 0 ? palette.error : palette.success,
                formatter: (v) => formatCurrency(v),
              },
            ]}
          />

          <Tabs
            items={[
              {
                key: 'charges',
                label: 'Hisoblar',
                children: (
                  <Table
                    size="small"
                    rowKey="id"
                    dataSource={financeSummaryQuery.data.charges}
                    pagination={false}
                    onRow={(record) => ({ onClick: () => navigate(`/tuition/${record.id}`), style: { cursor: 'pointer' } })}
                    columns={[
                      { title: 'Davr', dataIndex: 'billingPeriod' },
                      { title: 'Guruh', render: (_, record) => record.enrollment.group.name },
                      { title: 'Sof summa', dataIndex: 'netAmount', render: (v: string) => formatNumber(v, 2) },
                      { title: "To'langan", dataIndex: 'allocatedAmount', render: (v: number) => formatNumber(v, 2) },
                      { title: 'Qoldiq', dataIndex: 'outstanding', render: (v: number) => formatNumber(v, 2) },
                      { title: 'Muddati', dataIndex: 'dueDate', render: (v: string) => formatDate(v) },
                      { title: 'Status', dataIndex: 'status', render: (v: TuitionChargeStatus) => <Tag color={TUITION_STATUS_COLORS[v]}>{v}</Tag> },
                    ]}
                  />
                ),
              },
              {
                key: 'payments',
                label: "To'lovlar",
                children: (
                  <Table
                    size="small"
                    rowKey="id"
                    dataSource={financeSummaryQuery.data.payments}
                    pagination={false}
                    columns={[
                      { title: 'Raqam', dataIndex: 'paymentNumber' },
                      { title: 'Summa', dataIndex: 'amount', render: (v: string) => formatNumber(v, 2) },
                      { title: 'Taqsimlangan', dataIndex: 'allocatedAmount', render: (v: number) => formatNumber(v, 2) },
                      { title: 'Taqsimlanmagan', dataIndex: 'unallocatedAmount', render: (v: number) => formatNumber(v, 2) },
                      { title: 'Usul', dataIndex: 'method' },
                      { title: 'Sana', dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) },
                    ]}
                  />
                ),
              },
              {
                key: 'allocation-history',
                label: 'Taqsimlash tarixi',
                children: (
                  <Table
                    size="small"
                    rowKey="id"
                    dataSource={financeSummaryQuery.data.allocationHistory}
                    pagination={false}
                    columns={[
                      { title: 'Davr', dataIndex: 'billingPeriod' },
                      { title: "To'lov raqami", dataIndex: ['payment', 'paymentNumber'] },
                      { title: 'Summa', dataIndex: 'amount', render: (v: string) => formatNumber(v, 2) },
                      { title: 'Sana', dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) },
                    ]}
                  />
                ),
              },
              {
                key: 'discounts',
                label: 'Chegirmalar',
                children: (
                  <Table
                    size="small"
                    rowKey="id"
                    dataSource={financeSummaryQuery.data.discounts}
                    pagination={false}
                    columns={[
                      { title: 'Chegirma', dataIndex: ['discount', 'name'] },
                      {
                        title: 'Qiymati',
                        render: (_, record) => (record.discount.type === 'PERCENTAGE' ? `${Number(record.discount.value)}%` : formatNumber(record.discount.value)),
                      },
                      { title: 'Qamrovi', render: (_, record) => record.enrollment?.group.name ?? 'Barcha yozilishlar' },
                      { title: 'Boshlanish', dataIndex: 'startDate', render: (v: string) => formatDate(v) },
                      { title: 'Tugash', dataIndex: 'endDate', render: (v: string | null) => (v ? formatDate(v) : 'Doimiy') },
                      {
                        title: 'Amallar',
                        render: (_, record) =>
                          canRevokeDiscount && (
                            <Popconfirm title="Chegirmani bekor qilish?" onConfirm={() => revokeDiscountMutation.mutate(record.id)}>
                              <Button loading={revokeDiscountMutation.isPending} size="small" danger icon={<StopOutlined />} />
                            </Popconfirm>
                          ),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        </>
      ),
    },
    canViewGrades && {
      key: 'grades',
      label: 'Baholar',
      children: gradesQuery.isLoading ? (
        <Spin />
      ) : (
        <Table
          rowKey="id"
          size="small"
          dataSource={gradesQuery.data?.items}
          pagination={false}
          locale={{ emptyText: "Hali baho qo'yilmagan" }}
          onRow={(record) => ({ onClick: () => navigate(`/exams/${record.examId}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Imtihon', dataIndex: 'examTitle' },
            { title: 'Turi', dataIndex: 'examType', render: (v: ExamType) => EXAM_TYPE_LABELS[v] },
            { title: 'Kurs', render: (_, record) => record.course.name },
            { title: 'Guruh', render: (_, record) => record.group.name },
            { title: 'Sana', dataIndex: 'examDate', render: (v: string) => formatDate(v) },
            { title: 'Ball', render: (_, record) => `${record.score} / ${record.maxScore}` },
            { title: 'Foiz', dataIndex: 'percentage', render: (v: number) => `${v}%` },
            { title: 'Baho', dataIndex: 'grade' },
            { title: "Natija", render: (_, record) => <Tag color={record.passed ? 'green' : 'red'}>{record.passed ? "O'tdi" : 'Yiqildi'}</Tag> },
          ]}
        />
      ),
    },
    canViewProgress && {
      key: 'progress',
      label: "O'zlashtirish",
      children: progressQuery.isLoading ? (
        <Spin />
      ) : progressQuery.isError ? (
        <PageErrorState onRetry={() => progressQuery.refetch()} />
      ) : !progressQuery.data ? null : (
        <>
          <SummaryCard
            items={[
              { icon: <FormOutlined />, label: 'Jami imtihonlar', value: progressQuery.data.totalExams, color: palette.info },
              { icon: <TrophyOutlined />, label: "O'rtacha ball (%)", value: progressQuery.data.averagePercentage, color: palette.primary, formatter: (v) => v.toFixed(2) },
              {
                icon: <PercentageOutlined />,
                label: "O'tish darajasi (%)",
                value: progressQuery.data.passRate,
                color: progressQuery.data.passRate >= 60 ? palette.success : palette.error,
                formatter: (v) => v.toFixed(2),
              },
              {
                icon: <CheckCircleOutlined />,
                label: 'Davomat (%)',
                value: progressQuery.data.attendancePercentage,
                color: progressQuery.data.attendancePercentage >= 80 ? palette.success : progressQuery.data.attendancePercentage >= 50 ? palette.warning : palette.error,
                formatter: (v) => v.toFixed(2),
              },
            ]}
          />

          <Typography.Title level={5}>Kurslar bo'yicha o'zlashtirish (joriy yozilishlar)</Typography.Title>
          <Table
            rowKey="enrollmentId"
            size="small"
            style={{ marginBottom: 24 }}
            dataSource={progressQuery.data.courseProgress}
            pagination={false}
            locale={{ emptyText: "Faol yozilish yo'q" }}
            columns={[
              { title: 'Kurs', dataIndex: 'courseName' },
              { title: 'Guruh', dataIndex: 'groupName' },
              { title: 'Darslar', render: (_, record) => `${record.completedLessons} / ${record.totalLessons}` },
              { title: 'Jarayon', render: (_, record) => <Progress percent={record.progressPercentage} size="small" /> },
            ]}
          />

          <Typography.Title level={5}>Yakunlangan kurslar/guruhlar</Typography.Title>
          <Table
            rowKey="enrollmentId"
            size="small"
            style={{ marginBottom: 24 }}
            dataSource={progressQuery.data.completedGroups}
            pagination={false}
            locale={{ emptyText: "Hali yakunlangan kurs yo'q" }}
            columns={[
              { title: 'Kurs', dataIndex: 'courseName' },
              { title: 'Guruh', dataIndex: 'groupName' },
              { title: 'Yakunlangan sana', dataIndex: 'endDate', render: (v: string | null) => (v ? formatDate(v) : '—') },
            ]}
          />

          <Typography.Title level={5}>So'nggi imtihonlar</Typography.Title>
          <Table
            rowKey="id"
            size="small"
            dataSource={progressQuery.data.recentExams}
            pagination={false}
            locale={{ emptyText: "Hali baho qo'yilmagan" }}
            onRow={(record) => ({ onClick: () => navigate(`/exams/${record.examId}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Imtihon', dataIndex: 'examTitle' },
              { title: 'Sana', dataIndex: 'examDate', render: (v: string) => formatDate(v) },
              { title: 'Ball', render: (_, record) => `${record.score} / ${record.maxScore}` },
              { title: 'Baho', dataIndex: 'grade' },
            ]}
          />
        </>
      ),
    },
    canViewHistory && {
      key: 'history',
      label: 'Tarix',
      children: (
        <Table<AuditLogEntry>
          rowKey="id"
          size="small"
          loading={historyQuery.isLoading}
          dataSource={historyQuery.data?.items}
          pagination={false}
          locale={{ emptyText: 'Yozuvlar yo\'q' }}
          columns={[
            { title: 'Vaqt', dataIndex: 'createdAt', width: 160, render: (v: string) => formatDateTime(v) },
            { title: 'Kim', dataIndex: ['actor', 'fullName'], render: (v: string) => v ?? 'tizim' },
            { title: 'Amal', dataIndex: 'action', width: 130, render: (v: string) => <StatusTag value={v} /> },
            { title: 'Tavsif', dataIndex: 'description' },
          ]}
        />
      ),
    },
  ].filter((tab): tab is Exclude<typeof tab, false> => Boolean(tab));

  return (
    <div>
      <DetailHeader
        backLabel="O'quvchilar ro'yxatiga qaytish"
        onBack={() => navigate('/students')}
        avatar={
          <Avatar size={48} style={{ background: avatarColor(student.fullName), fontSize: 18, flexShrink: 0 }}>
            {student.fullName.charAt(0)}
          </Avatar>
        }
        title={student.fullName}
        subtitle={
          <>
            {student.studentCode} · {student.branch?.name ?? 'Filialsiz'}
          </>
        }
        actions={
          <ActionBar>
            <Tag color={STATUS_COLORS[student.status]}>{STATUS_LABELS[student.status]}</Tag>
            {canEdit && (
              <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                Tahrirlash
              </Button>
            )}
            {canEdit && student.status !== 'INACTIVE' && (
              <Popconfirm title="O'quvchini nofaol qilishni tasdiqlaysizmi?" onConfirm={() => deactivateMutation.mutate()}>
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

      <StudentFormModal open={editOpen} onClose={() => setEditOpen(false)} student={student} />
      <EnrollmentFormModal open={enrollOpen} onClose={() => setEnrollOpen(false)} defaultStudentId={student.id} />
      {transferTarget && (
        <TransferEnrollmentModal
          open={!!transferTarget}
          onClose={() => setTransferTarget(undefined)}
          enrollment={{
            ...transferTarget,
            student: { fullName: student.fullName },
          }}
        />
      )}
      <LinkGuardianModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        studentId={student.id}
        alreadyLinkedGuardianIds={student.guardians.map((g) => g.guardianId)}
      />
      <CreateTuitionChargeModal open={chargeModalOpen} onClose={() => setChargeModalOpen(false)} fixedStudentId={id} />
      <GrantDiscountModal open={grantModalOpen} onClose={() => setGrantModalOpen(false)} studentId={id!} />
    </div>
  );
}
