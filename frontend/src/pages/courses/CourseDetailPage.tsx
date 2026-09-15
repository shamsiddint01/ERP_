import { ArrowLeftOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Popconfirm, Row, Space, Spin, Statistic, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deactivateCourse, getCourse } from '../../api/courses';
import { CourseFormModal } from '../../components/CourseFormModal';
import { useAuthStore } from '../../store/auth.store';
import type { CourseLevel, CourseStatus } from '../../types';

const STATUS_COLORS: Record<CourseStatus, string> = { DRAFT: 'default', ACTIVE: 'green', INACTIVE: 'gold', ARCHIVED: 'red' };
const STATUS_LABELS: Record<CourseStatus, string> = { DRAFT: 'Qoralama', ACTIVE: 'Faol', INACTIVE: 'Nofaol', ARCHIVED: 'Arxivlangan' };
const LEVEL_LABELS: Record<CourseLevel, string> = {
  BEGINNER: 'Beginner',
  ELEMENTARY: 'Elementary',
  PRE_INTERMEDIATE: 'Pre-Intermediate',
  INTERMEDIATE: 'Intermediate',
  UPPER_INTERMEDIATE: 'Upper-Intermediate',
  ADVANCED: 'Advanced',
};

export function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [editOpen, setEditOpen] = useState(false);

  const courseQuery = useQuery({ queryKey: ['course', id], queryFn: () => getCourse(id!), enabled: !!id });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateCourse(id!),
    onSuccess: () => {
      message.success('Kurs nofaol qilindi');
      queryClient.invalidateQueries({ queryKey: ['course', id] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Amalni bajarib bo'lmadi");
    },
  });

  if (courseQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const course = courseQuery.data;
  if (!course) return null;

  const canEdit = hasPermission('courses', 'EDIT');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/courses')} style={{ marginBottom: 8 }}>
        Kurslar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {course.name} <Tag>{course.code}</Tag>
            </Typography.Title>
            <Typography.Text type="secondary">{course.category?.name ?? 'Kategoriyasiz'}</Typography.Text>
          </Col>
          <Col>
            <Space>
              <Tag color={STATUS_COLORS[course.status]}>{STATUS_LABELS[course.status]}</Tag>
              {canEdit && (
                <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                  Tahrirlash
                </Button>
              )}
              {canEdit && course.status !== 'INACTIVE' && (
                <Popconfirm title="Kursni nofaol qilishni tasdiqlaysizmi?" onConfirm={() => deactivateMutation.mutate()}>
                  <Button danger icon={<StopOutlined />} loading={deactivateMutation.isPending}>
                    Nofaol qilish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>

        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }}>
          <Descriptions.Item label="Daraja">{course.level ? LEVEL_LABELS[course.level] : '—'}</Descriptions.Item>
          <Descriptions.Item label="Davomiyligi">{course.durationWeeks ? `${course.durationWeeks} hafta` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Dars davomiyligi">{course.lessonDurationMinutes} daqiqa</Descriptions.Item>
          {course.description && (
            <Descriptions.Item label="Tavsif" span={3}>
              {course.description}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic title="Standart to'lov summasi" value={Number(course.defaultTuition)} suffix="so'm" formatter={(v) => Number(v).toLocaleString('uz-UZ')} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Guruhlar soni" value={course._count.studentGroups} />
          </Card>
        </Col>
      </Row>

      <CourseFormModal open={editOpen} onClose={() => setEditOpen(false)} course={course} />
    </div>
  );
}
