import { ArrowLeftOutlined, EditOutlined, StopOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Empty, Popconfirm, Row, Space, Spin, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deactivateGroup, getGroup } from '../../api/groups';
import { EnrollmentFormModal } from '../../components/EnrollmentFormModal';
import { GroupFormModal } from '../../components/GroupFormModal';
import { useAuthStore } from '../../store/auth.store';
import type { EnrollmentStatus, StudentGroupStatus } from '../../types';

const STATUS_COLORS: Record<StudentGroupStatus, string> = { PLANNED: 'default', ACTIVE: 'green', PAUSED: 'gold', COMPLETED: 'blue', CANCELLED: 'red' };
const STATUS_LABELS: Record<StudentGroupStatus, string> = {
  PLANNED: 'Rejalashtirilgan',
  ACTIVE: 'Faol',
  PAUSED: 'Muzlatilgan',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
};
const ENROLLMENT_STATUS_COLORS: Record<EnrollmentStatus, string> = { ACTIVE: 'green', PAUSED: 'gold', COMPLETED: 'blue', CANCELLED: 'red', TRANSFERRED: 'purple' };

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [editOpen, setEditOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const groupQuery = useQuery({ queryKey: ['group', id], queryFn: () => getGroup(id!), enabled: !!id });

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

  if (groupQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const group = groupQuery.data;
  if (!group) return null;

  const canEdit = hasPermission('groups', 'EDIT');
  const canEnroll = hasPermission('enrollments', 'CREATE');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/groups')} style={{ marginBottom: 8 }}>
        Guruhlar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {group.name} <Tag>{group.code}</Tag>
            </Typography.Title>
            <Typography.Text type="secondary">{group.course.name}</Typography.Text>
          </Col>
          <Col>
            <Space>
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
                  <Button danger icon={<StopOutlined />} loading={deactivateMutation.isPending}>
                    Bekor qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={6}>
            <Statistic title="Sig'imi" value={group.capacity} />
          </Col>
          <Col span={6}>
            <Statistic title="Yozilgan" value={group.enrolledCount} />
          </Col>
          <Col span={6}>
            <Statistic title="Bo'sh o'rinlar" value={group.availableSeats} styles={{ content: { color: group.availableSeats > 0 ? '#3f8600' : '#cf1322' } }} />
          </Col>
          <Col span={6}>
            <Statistic title="To'lov" value={group.tuitionAmount ? Number(group.tuitionAmount) : 0} formatter={(v) => Number(v).toLocaleString('uz-UZ')} />
          </Col>
        </Row>
      </Card>

      <Card>
        <Tabs
          items={[
            {
              key: 'overview',
              label: 'Umumiy',
              children: (
                <Descriptions column={2}>
                  <Descriptions.Item label="Daraja">{group.level ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Boshlanish sanasi">{dayjs(group.startDate).format('DD.MM.YYYY')}</Descriptions.Item>
                  <Descriptions.Item label="Tugash sanasi">{group.endDate ? dayjs(group.endDate).format('DD.MM.YYYY') : '—'}</Descriptions.Item>
                  <Descriptions.Item label="Status">{STATUS_LABELS[group.status]}</Descriptions.Item>
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
                      render: (_, record) => (
                        <Typography.Link onClick={() => navigate(`/students/${record.student.id}`)}>{record.student.fullName}</Typography.Link>
                      ),
                    },
                    { title: 'Boshlanish', dataIndex: 'startDate', render: (v: string) => dayjs(v).format('DD.MM.YYYY') },
                    { title: "Kelishilgan to'lov", dataIndex: 'agreedTuition', render: (v: string | null) => (v ? Number(v).toLocaleString('uz-UZ') : '—') },
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
                <Empty description="Hali hech kim yozilmagan" />
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
                <Empty description="O'qituvchi tayinlanmagan" />
              ),
            },
            {
              key: 'course',
              label: 'Kurs',
              children: (
                <Descriptions column={1}>
                  <Descriptions.Item label="Kurs">
                    <Typography.Link onClick={() => navigate(`/courses/${group.course.id}`)}>{group.course.name}</Typography.Link>
                  </Descriptions.Item>
                  <Descriptions.Item label="Kod">{group.course.code}</Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'location',
              label: 'Joylashuv',
              children: (
                <Descriptions column={1}>
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
                </Descriptions>
              ),
            },
          ]}
        />
      </Card>

      <GroupFormModal open={editOpen} onClose={() => setEditOpen(false)} group={group} />
      <EnrollmentFormModal open={enrollOpen} onClose={() => setEnrollOpen(false)} defaultGroupId={group.id} />
    </div>
  );
}
