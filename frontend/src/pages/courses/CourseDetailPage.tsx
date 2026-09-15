import { EditOutlined, GroupOutlined, StopOutlined, WalletOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Popconfirm, Spin, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deactivateCourse, getCourse } from '../../api/courses';
import { ActionBar } from '../../components/ActionBar';
import { CourseFormModal } from '../../components/CourseFormModal';
import { DetailHeader } from '../../components/DetailHeader';
import { InfoGrid } from '../../components/InfoGrid';
import { PageErrorState } from '../../components/PageErrorState';
import { SummaryCard } from '../../components/SummaryCard';
import { palette } from '../../theme';
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

  if (courseQuery.isError) {
    return <PageErrorState onRetry={() => courseQuery.refetch()} />;
  }

  const course = courseQuery.data;
  if (!course) return null;

  const canEdit = hasPermission('courses', 'EDIT');

  return (
    <div>
      <DetailHeader
        backLabel="Kurslar ro'yxatiga qaytish"
        onBack={() => navigate('/courses')}
        title={
          <>
            {course.name} <Tag>{course.code}</Tag>
          </>
        }
        subtitle={course.category?.name ?? 'Kategoriyasiz'}
        actions={
          <ActionBar>
            <Tag color={STATUS_COLORS[course.status]}>{STATUS_LABELS[course.status]}</Tag>
            {canEdit && (
              <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                Tahrirlash
              </Button>
            )}
            {canEdit && course.status !== 'INACTIVE' && (
              <Popconfirm title="Kursni nofaol qilishni tasdiqlaysizmi?" onConfirm={() => deactivateMutation.mutate()}>
                <Button loading={deactivateMutation.isPending} danger icon={<StopOutlined />}>
                  Nofaol qilish
                </Button>
              </Popconfirm>
            )}
          </ActionBar>
        }
      >
        <InfoGrid
          items={[
            { label: 'Daraja', value: course.level ? LEVEL_LABELS[course.level] : undefined },
            { label: 'Davomiyligi', value: course.durationWeeks ? `${course.durationWeeks} hafta` : undefined },
            { label: 'Dars davomiyligi', value: `${course.lessonDurationMinutes} daqiqa` },
            ...(course.description ? [{ label: 'Tavsif', value: course.description, span: 3 }] : []),
          ]}
        />
      </DetailHeader>

      <SummaryCard
        items={[
          {
            icon: <WalletOutlined />,
            color: palette.primary,
            label: "Standart to'lov summasi",
            value: Number(course.defaultTuition),
            formatter: (v) => `${v.toLocaleString('uz-UZ')} so'm`,
          },
          { icon: <GroupOutlined />, color: palette.info, label: 'Guruhlar soni', value: course._count.studentGroups },
        ]}
      />

      <CourseFormModal open={editOpen} onClose={() => setEditOpen(false)} course={course} />
    </div>
  );
}
