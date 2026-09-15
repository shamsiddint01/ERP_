import { ArrowLeftOutlined, EditOutlined, PlusOutlined, SearchOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Popconfirm, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deactivateCourseCategory, listCourseCategories } from '../../api/courseCategories';
import { CourseCategoryFormModal } from '../../components/CourseCategoryFormModal';
import { useAuthStore } from '../../store/auth.store';
import type { CourseCategoryListItem, CourseCategoryStatus } from '../../types';

const STATUS_COLORS: Record<CourseCategoryStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };
const STATUS_LABELS: Record<CourseCategoryStatus, string> = { ACTIVE: 'Faol', INACTIVE: 'Nofaol' };

export function CourseCategoriesPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CourseCategoryStatus | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CourseCategoryListItem | undefined>();

  const categoriesQuery = useQuery({
    queryKey: ['course-categories', { search, status, page }],
    queryFn: () => listCourseCategories({ search: search || undefined, status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateCourseCategory,
    onSuccess: () => {
      message.success('Kategoriya nofaol qilindi');
      queryClient.invalidateQueries({ queryKey: ['course-categories'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Amalni bajarib bo'lmadi");
    },
  });

  const canEdit = hasPermission('courses', 'EDIT');
  const canDelete = hasPermission('courses', 'DELETE');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/courses')} style={{ marginBottom: 8 }}>
        Kurslar ro'yxatiga qaytish
      </Button>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Kurs kategoriyalari
        </Typography.Title>
        {hasPermission('courses', 'CREATE') && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(undefined);
              setModalOpen(true);
            }}
          >
            Yangi kategoriya
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Qidirish: nomi yoki kodi"
          prefix={<SearchOutlined />}
          style={{ width: 240 }}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
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

      <Table<CourseCategoryListItem>
        rowKey="id"
        loading={categoriesQuery.isLoading}
        dataSource={categoriesQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: categoriesQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Nomi', dataIndex: 'name' },
          { title: 'Kod', dataIndex: 'code' },
          { title: 'Izoh', dataIndex: 'description', render: (v: string | null) => v ?? '—' },
          { title: 'Kurslar soni', render: (_, record) => record._count.courses },
          { title: 'Status', dataIndex: 'status', render: (v: CourseCategoryStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          {
            title: 'Amallar',
            render: (_, record) => (
              <Space>
                {canEdit && (
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditing(record);
                      setModalOpen(true);
                    }}
                  >
                    Tahrirlash
                  </Button>
                )}
                {canDelete && record.status === 'ACTIVE' && (
                  <Popconfirm title="Kategoriyani nofaol qilish?" onConfirm={() => deactivateMutation.mutate(record.id)}>
                    <Button loading={deactivateMutation.isPending} size="small" danger icon={<StopOutlined />}>
                      Nofaol qilish
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <CourseCategoryFormModal open={modalOpen} onClose={() => setModalOpen(false)} category={editing} />
    </div>
  );
}
