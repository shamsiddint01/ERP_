import { AppstoreOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listCourseCategories } from '../../api/courseCategories';
import { listCourses } from '../../api/courses';
import { CourseFormModal } from '../../components/CourseFormModal';
import { PageErrorState } from '../../components/PageErrorState';
import { useAuthStore } from '../../store/auth.store';
import type { CourseLevel, CourseListItem, CourseStatus } from '../../types';

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

export function CoursesPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [status, setStatus] = useState<CourseStatus | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const categoriesQuery = useQuery({ queryKey: ['course-categories', { pageSize: 100 }], queryFn: () => listCourseCategories({ pageSize: 100 }) });
  const coursesQuery = useQuery({
    queryKey: ['courses', { search, categoryId, status, page }],
    queryFn: () => listCourses({ search: search || undefined, categoryId, status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  if (coursesQuery.isError && !coursesQuery.data) {
    return <PageErrorState onRetry={() => coursesQuery.refetch()} />;
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Kurslar
        </Typography.Title>
        <Space>
          <Button icon={<AppstoreOutlined />} onClick={() => navigate('/course-categories')}>
            Kategoriyalar
          </Button>
          {hasPermission('courses', 'CREATE') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Yangi kurs
            </Button>
          )}
        </Space>
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Qidirish: nomi, kodi, tavsifi"
          prefix={<SearchOutlined />}
          style={{ width: 260 }}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Kategoriya"
          allowClear
          style={{ width: 200 }}
          options={categoriesQuery.data?.items.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(value) => {
            setCategoryId(value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 160 }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </Space>

      <Table<CourseListItem>
        rowKey="id"
        loading={coursesQuery.isLoading}
        dataSource={coursesQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/courses/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: coursesQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Nomi', dataIndex: 'name' },
          { title: 'Kod', dataIndex: 'code' },
          { title: 'Kategoriya', render: (_, record) => record.category?.name ?? '—' },
          { title: 'Daraja', dataIndex: 'level', render: (v: CourseLevel | null) => (v ? LEVEL_LABELS[v] : '—') },
          { title: "Standart to'lov", dataIndex: 'defaultTuition', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          { title: 'Guruhlar', render: (_, record) => record._count.studentGroups },
          { title: 'Status', dataIndex: 'status', render: (v: CourseStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
        ]}
      />

      <CourseFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
