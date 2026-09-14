import { ArrowLeftOutlined, CarryOutOutlined, EditOutlined, FormOutlined, LineChartOutlined, LinkOutlined, PauseCircleOutlined, PlayCircleOutlined, StarFilled, StarOutlined, StopOutlined, SwapOutlined, UserAddOutlined, WalletOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Empty, Popconfirm, Row, Space, Spin, Table, Tabs, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { activateEnrollment, pauseEnrollment } from '../../api/enrollments';
import { deactivateStudent, getStudent, removeStudentGuardian, updateStudentGuardianLink } from '../../api/students';
import { EnrollmentFormModal } from '../../components/EnrollmentFormModal';
import { LinkGuardianModal } from '../../components/LinkGuardianModal';
import { StudentFormModal } from '../../components/StudentFormModal';
import { TransferEnrollmentModal } from '../../components/TransferEnrollmentModal';
import { useAuthStore } from '../../store/auth.store';
import type { EnrollmentStatus, StudentEnrollmentItem, StudentStatus } from '../../types';

const STATUS_COLORS: Record<StudentStatus, string> = { ACTIVE: 'green', PAUSED: 'gold', GRADUATED: 'blue', INACTIVE: 'default', LEFT: 'red' };
const STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'Faol',
  PAUSED: 'Muzlatilgan',
  GRADUATED: 'Bitirgan',
  INACTIVE: 'Nofaol',
  LEFT: "Chiqib ketgan",
};
const ENROLLMENT_STATUS_COLORS: Record<EnrollmentStatus, string> = { ACTIVE: 'green', PAUSED: 'gold', COMPLETED: 'blue', CANCELLED: 'red', TRANSFERRED: 'purple' };

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<StudentEnrollmentItem | undefined>();

  const studentQuery = useQuery({ queryKey: ['student', id], queryFn: () => getStudent(id!), enabled: !!id });

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

  if (studentQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const student = studentQuery.data;
  if (!student) return null;

  const canEdit = hasPermission('students', 'EDIT');
  const canViewAttendance = hasPermission('student_attendance', 'VIEW');
  const canViewFinance = hasPermission('tuition', 'VIEW');
  const canViewGrades = hasPermission('grades', 'VIEW');
  const canViewProgress = hasPermission('exams', 'VIEW');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/students')} style={{ marginBottom: 8 }}>
        O'quvchilar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {student.fullName}
            </Typography.Title>
            <Typography.Text type="secondary">
              {student.studentCode} · {student.branch?.name ?? 'Filialsiz'}
            </Typography.Text>
          </Col>
          <Col>
            <Space>
              <Tag color={STATUS_COLORS[student.status]}>{STATUS_LABELS[student.status]}</Tag>
              {canViewAttendance && (
                <Button icon={<CarryOutOutlined />} onClick={() => navigate(`/students/${student.id}/attendance`)}>
                  Davomat
                </Button>
              )}
              {canViewFinance && (
                <Button icon={<WalletOutlined />} onClick={() => navigate(`/students/${student.id}/finance`)}>
                  Moliya
                </Button>
              )}
              {canViewGrades && (
                <Button icon={<FormOutlined />} onClick={() => navigate(`/students/${student.id}/grades`)}>
                  Baholar
                </Button>
              )}
              {canViewProgress && (
                <Button icon={<LineChartOutlined />} onClick={() => navigate(`/students/${student.id}/progress`)}>
                  O'zlashtirish
                </Button>
              )}
              {canEdit && (
                <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                  Tahrirlash
                </Button>
              )}
              {canEdit && student.status !== 'INACTIVE' && (
                <Popconfirm title="O'quvchini nofaol qilishni tasdiqlaysizmi?" onConfirm={() => deactivateMutation.mutate()}>
                  <Button danger icon={<StopOutlined />} loading={deactivateMutation.isPending}>
                    Nofaol qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>

        <Descriptions column={3} style={{ marginTop: 16 }} title="Shaxsiy ma'lumotlar">
          <Descriptions.Item label="Telefon">{student.phone ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Email">{student.email ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Tug'ilgan sana">{student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString('uz-UZ') : '—'}</Descriptions.Item>
          <Descriptions.Item label="Jinsi">{student.gender ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Favqulodda aloqa">{student.emergencyContact ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Manzil">{student.address ?? '—'}</Descriptions.Item>
        </Descriptions>

        <Descriptions column={3} style={{ marginTop: 16 }} title="Ro'yxat ma'lumotlari">
          <Descriptions.Item label="Ro'yxatga olingan sana">{new Date(student.registrationDate).toLocaleDateString('uz-UZ')}</Descriptions.Item>
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
              {student.convertedFromLead.fullName} ({new Date(student.convertedFromLead.createdAt).toLocaleDateString('uz-UZ')} sanasida lid sifatida yaratilgan)
            </Descriptions.Item>
          )}
          {student.notes && (
            <Descriptions.Item label="Izoh" span={3}>
              {student.notes}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card>
        <Tabs
          items={[
            {
              key: 'guardians',
              label: `Vasiylar (${student.guardians.length})`,
              children: (
                <>
                  {hasPermission('students', 'EDIT') && (
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
                                <Button size="small" danger onClick={(e) => e.stopPropagation()}>
                                  Bekor qilish
                                </Button>
                              </Popconfirm>
                            ),
                        },
                      ]}
                    />
                  ) : (
                    <Empty description="Vasiylar bog'lanmagan" />
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
                        { title: 'Boshlanish sanasi', dataIndex: 'startDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
                        { title: "To'lov summasi", dataIndex: 'agreedTuition', render: (v: string | null) => (v ? Number(v).toLocaleString('uz-UZ') : '—') },
                        { title: 'Chegirma', dataIndex: 'discountAmount', render: (v: string | null) => (v ? Number(v).toLocaleString('uz-UZ') : '—') },
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
                    <Empty description="Yozilishlar yo'q" />
                  )}
                </>
              ),
            },
          ]}
        />
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
    </div>
  );
}
