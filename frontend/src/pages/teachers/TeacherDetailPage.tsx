import { ArrowLeftOutlined, CreditCardOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Empty, Popconfirm, Row, Space, Spin, Statistic, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deactivateTeacher, getTeacher } from '../../api/teachers';
import { TeacherFormModal } from '../../components/TeacherFormModal';
import { useAuthStore } from '../../store/auth.store';
import type { StudentGroupStatus, TeacherProfileStatus } from '../../types';

const STATUS_COLORS: Record<TeacherProfileStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };
const STATUS_LABELS: Record<TeacherProfileStatus, string> = { ACTIVE: 'Faol', INACTIVE: 'Nofaol' };
const GROUP_STATUS_COLORS: Record<StudentGroupStatus, string> = { PLANNED: 'default', ACTIVE: 'green', PAUSED: 'gold', COMPLETED: 'blue', CANCELLED: 'red' };

export function TeacherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [editOpen, setEditOpen] = useState(false);

  const teacherQuery = useQuery({ queryKey: ['teacher', id], queryFn: () => getTeacher(id!), enabled: !!id });

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

  const teacher = teacherQuery.data;
  if (!teacher) return null;

  const canEdit = hasPermission('teachers', 'EDIT');
  const canViewCompensation = hasPermission('compensation', 'VIEW');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/teachers')} style={{ marginBottom: 8 }}>
        O'qituvchilar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {teacher.employee.fullName}
            </Typography.Title>
            <Typography.Text type="secondary">
              {teacher.employee.employeeCode} · {teacher.specialization ?? 'Mutaxassisligi ko\'rsatilmagan'}
            </Typography.Text>
          </Col>
          <Col>
            <Space>
              <Tag color={STATUS_COLORS[teacher.status]}>{STATUS_LABELS[teacher.status]}</Tag>
              {canViewCompensation && (
                <Button icon={<CreditCardOutlined />} onClick={() => navigate(`/teachers/${teacher.id}/compensation`)}>
                  Maosh
                </Button>
              )}
              {canEdit && (
                <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                  Tahrirlash
                </Button>
              )}
              {canEdit && teacher.status !== 'INACTIVE' && (
                <Popconfirm title="O'qituvchi profilini nofaol qilishni tasdiqlaysizmi?" onConfirm={() => deactivateMutation.mutate()}>
                  <Button danger icon={<StopOutlined />} loading={deactivateMutation.isPending}>
                    Nofaol qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>

        <Descriptions column={3} style={{ marginTop: 16 }} title="Xodim ma'lumotlari">
          <Descriptions.Item label="Telefon">{teacher.employee.phone}</Descriptions.Item>
          <Descriptions.Item label="Email">{teacher.employee.email ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Bo'lim">{teacher.employee.department?.name ?? '—'}</Descriptions.Item>
        </Descriptions>

        <Descriptions column={3} style={{ marginTop: 16 }} title="O'qituvchi profili">
          <Descriptions.Item label="Malaka">{teacher.qualification ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Tajriba">{teacher.experienceYears !== null ? `${teacher.experienceYears} yil` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Soatlik stavka">{teacher.hourlyRate ? Number(teacher.hourlyRate).toLocaleString('uz-UZ') : '—'}</Descriptions.Item>
          {teacher.bio && (
            <Descriptions.Item label="Bio" span={3}>
              {teacher.bio}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic title="Faol guruhlar" value={teacher.workload.activeGroupsCount} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Faol o'quvchilar" value={teacher.workload.activeStudentsCount} styles={{ content: { color: '#3f8600' } }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Jami o'quvchilar (tarixiy)" value={teacher.workload.totalEnrolledStudents} />
          </Card>
        </Col>
      </Row>

      <Card title={`Tayinlangan guruhlar (${teacher.groups.length})`}>
        {teacher.groups.length ? (
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
              { title: 'Boshlanish', dataIndex: 'startDate', render: (v: string) => dayjs(v).format('DD.MM.YYYY') },
              { title: 'Status', dataIndex: 'status', render: (v: StudentGroupStatus) => <Tag color={GROUP_STATUS_COLORS[v]}>{v}</Tag> },
            ]}
          />
        ) : (
          <Empty description="Hali guruh tayinlanmagan" />
        )}
      </Card>

      <TeacherFormModal open={editOpen} onClose={() => setEditOpen(false)} teacher={teacher} />
    </div>
  );
}
