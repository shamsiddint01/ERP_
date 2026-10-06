import { DeleteOutlined, EditOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Col, DatePicker, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Progress, Row, Segmented, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { listBranches } from '../../api/branches';
import { listCourses } from '../../api/courses';
import { createExtraLesson, deleteExtraLesson, getExtraLesson, listExtraLessons, updateExtraLesson } from '../../api/extraLessons';
import { listTeachers } from '../../api/teachers';
import { EmptyState } from '../../components/EmptyState';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { useAuthStore } from '../../store/auth.store';
import { palette } from '../../theme';
import type { ExtraLessonItem, ExtraLessonStatus } from '../../types';
import { formatDateTime } from '../../utils/format';

const STATUS: Record<ExtraLessonStatus, { label: string; color: string }> = {
  SCHEDULED: { label: 'Rejalashtirilgan', color: 'blue' },
  CANCELLED: { label: 'Bekor qilingan', color: 'red' },
  COMPLETED: { label: "O'tkazilgan", color: 'green' },
};

interface LessonForm {
  title: string;
  description?: string;
  teacherEmployeeId?: string;
  courseId?: string;
  branchId?: string;
  room?: string;
  time: [Dayjs, Dayjs];
  capacity: number;
}

function apiError(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(detail) ? detail.join(', ') : (detail ?? fallback);
}

/** Davomat → "Qo'shimcha darslar": announce extra lessons students can sign up for, and see who did. */
export function ExtraLessonsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canCreate = hasPermission('extra_lessons', 'CREATE');
  const canEdit = hasPermission('extra_lessons', 'EDIT');
  const canDelete = hasPermission('extra_lessons', 'DELETE');
  const canTeachers = hasPermission('teachers', 'VIEW');
  const canCourses = hasPermission('courses', 'VIEW');
  const canBranches = hasPermission('branches', 'VIEW');

  const [scope, setScope] = useState<'upcoming' | 'all'>('upcoming');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ExtraLessonItem | 'new' | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [form] = Form.useForm<LessonForm>();

  const lessonsQuery = useQuery({
    queryKey: ['extra-lessons', { scope, page }],
    queryFn: () => listExtraLessons({ upcoming: scope === 'upcoming' || undefined, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });
  const formOpen = !!editing;
  const teachersQuery = useQuery({ queryKey: ['teachers', { status: 'ACTIVE', pageSize: 100 }], queryFn: () => listTeachers({ status: 'ACTIVE', pageSize: 100 }), enabled: formOpen && canTeachers });
  const coursesQuery = useQuery({ queryKey: ['courses', { pageSize: 100 }], queryFn: () => listCourses({ pageSize: 100 }), enabled: formOpen && canCourses });
  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100 }], queryFn: () => listBranches({ pageSize: 100 }), enabled: formOpen && canBranches });
  const detailQuery = useQuery({ queryKey: ['extra-lesson', viewingId], queryFn: () => getExtraLesson(viewingId!), enabled: !!viewingId });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['extra-lessons'] });
    queryClient.invalidateQueries({ queryKey: ['extra-lesson'] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: LessonForm) => {
      const payload = {
        title: values.title,
        description: values.description || undefined,
        teacherEmployeeId: values.teacherEmployeeId,
        courseId: values.courseId,
        branchId: values.branchId,
        room: values.room || undefined,
        startsAt: values.time[0].toISOString(),
        endsAt: values.time[1].toISOString(),
        capacity: values.capacity,
      };
      return editing === 'new' ? createExtraLesson(payload) : updateExtraLesson((editing as ExtraLessonItem).id, payload);
    },
    onSuccess: () => {
      message.success(editing === 'new' ? "Qo'shimcha dars e'lon qilindi" : 'Saqlandi');
      refresh();
      setEditing(null);
    },
    onError: (error) => message.error(apiError(error, "Saqlab bo'lmadi")),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ExtraLessonStatus }) => updateExtraLesson(id, { status }),
    onSuccess: () => {
      message.success('Holat yangilandi');
      refresh();
    },
    onError: (error) => message.error(apiError(error, "Saqlab bo'lmadi")),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteExtraLesson,
    onSuccess: () => {
      message.success("O'chirildi");
      refresh();
    },
    onError: (error) => message.error(apiError(error, "O'chirib bo'lmadi")),
  });

  const openForm = (lesson: ExtraLessonItem | 'new') => setEditing(lesson);
  const defaultStart = dayjs().add(1, 'day').hour(16).minute(0).second(0);
  const formInitialValues: Partial<LessonForm> =
    editing === 'new' || !editing
      ? { time: [defaultStart, defaultStart.add(90, 'minute')], capacity: 12 }
      : {
          title: editing.title,
          description: editing.description ?? undefined,
          teacherEmployeeId: editing.teacherEmployee?.id,
          courseId: editing.course?.id,
          branchId: editing.branch?.id,
          room: editing.room ?? undefined,
          time: [dayjs(editing.startsAt), dayjs(editing.endsAt)],
          capacity: editing.capacity,
        };

  if (lessonsQuery.isError && !lessonsQuery.data) return <PageErrorState onRetry={() => lessonsQuery.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Qo'shimcha darslar"
        subtitle="O'quvchilar o'z kabinetidan yoziladi"
        extra={
          canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm('new')}>
              Yangi dars
            </Button>
          )
        }
      />
      <Segmented
        value={scope}
        onChange={(value) => {
          setScope(value as 'upcoming' | 'all');
          setPage(1);
        }}
        options={[
          { value: 'upcoming', label: 'Kelgusi' },
          { value: 'all', label: 'Barchasi' },
        ]}
        style={{ marginBottom: 16 }}
      />
      <Table<ExtraLessonItem>
        rowKey="id"
        loading={lessonsQuery.isLoading}
        dataSource={lessonsQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: lessonsQuery.data?.total, onChange: setPage, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: <EmptyState title="Qo'shimcha dars yo'q" /> }}
        onRow={(record) => ({ onClick: () => setViewingId(record.id), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: 'Dars',
            render: (_, r) => (
              <div>
                <div style={{ fontWeight: 600 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: palette.textMuted }}>{[r.course?.name, r.teacherEmployee?.fullName].filter(Boolean).join(' · ') || '—'}</div>
              </div>
            ),
          },
          { title: 'Vaqt', render: (_, r) => `${formatDateTime(r.startsAt)} – ${dayjs(r.endsAt).format('HH:mm')}` },
          { title: 'Joy', render: (_, r) => [r.branch?.name, r.room].filter(Boolean).join(' · ') || '—' },
          {
            title: 'Yozilganlar',
            width: 160,
            render: (_, r) => <Progress percent={Math.round((r._count.registrations / r.capacity) * 100)} size="small" format={() => `${r._count.registrations}/${r.capacity}`} strokeColor={palette.primary} />,
          },
          { title: 'Holat', render: (_, r) => <Tag color={STATUS[r.status].color}>{STATUS[r.status].label}</Tag> },
          {
            title: '',
            render: (_, r) => (
              <Space onClick={(e) => e.stopPropagation()}>
                {canEdit && r.status === 'SCHEDULED' && <Button size="small" icon={<EditOutlined />} onClick={() => openForm(r)} aria-label="Tahrirlash" />}
                {canEdit && r.status === 'SCHEDULED' && (
                  <Popconfirm title="Dars bekor qilinsinmi? Yozilgan o'quvchilar buni kabinetida ko'radi." onConfirm={() => statusMutation.mutate({ id: r.id, status: 'CANCELLED' })}>
                    <Button size="small" icon={<StopOutlined />} aria-label="Bekor qilish" />
                  </Popconfirm>
                )}
                {canDelete && r._count.registrations === 0 && (
                  <Popconfirm title="Dars o'chirilsinmi?" onConfirm={() => deleteMutation.mutate(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} aria-label="O'chirish" />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing === 'new' ? "Yangi qo'shimcha dars" : 'Darsni tahrirlash'}
        open={formOpen}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okText="Saqlash"
        cancelText="Bekor qilish"
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
        width={640}
      >
        <Form
          key={editing === 'new' ? 'new' : editing?.id}
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={formInitialValues}
          onFinish={(values) => saveMutation.mutate(values)}
        >
          <Form.Item name="title" label="Mavzu" rules={[{ required: true, whitespace: true, message: 'Mavzuni kiriting' }]}>
            <Input maxLength={200} placeholder="Masalan: Speaking Club" />
          </Form.Item>
          <Form.Item name="description" label="Tavsif">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={2000} />
          </Form.Item>
          <Form.Item name="time" label="Vaqti" rules={[{ required: true, message: 'Vaqtni tanlang' }]}>
            <DatePicker.RangePicker showTime={{ format: 'HH:mm' }} format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
          </Form.Item>
          <Row gutter={12}>
            {canTeachers && (
              <Col xs={24} sm={12}>
                <Form.Item name="teacherEmployeeId" label="O'qituvchi">
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    loading={teachersQuery.isLoading}
                    options={teachersQuery.data?.items.map((t) => ({ value: t.employee.id, label: t.employee.fullName }))}
                  />
                </Form.Item>
              </Col>
            )}
            {canCourses && (
              <Col xs={24} sm={12}>
                <Form.Item name="courseId" label="Kurs">
                  <Select allowClear showSearch optionFilterProp="label" loading={coursesQuery.isLoading} options={coursesQuery.data?.items.map((c) => ({ value: c.id, label: c.name }))} />
                </Form.Item>
              </Col>
            )}
            {canBranches && (
              <Col xs={24} sm={12}>
                <Form.Item name="branchId" label="Filial">
                  <Select allowClear loading={branchesQuery.isLoading} options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))} />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={12}>
              <Form.Item name="room" label="Xona">
                <Input maxLength={100} placeholder="Masalan: Room 101" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="capacity" label="O'rinlar soni" rules={[{ required: true, message: 'Sonini kiriting' }]} style={{ marginBottom: 0 }}>
                <InputNumber min={1} max={500} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Drawer title={detailQuery.data?.title ?? "Qo'shimcha dars"} open={!!viewingId} onClose={() => setViewingId(null)} size={520} destroyOnHidden>
        {detailQuery.data && (
          <>
            <Typography.Paragraph type="secondary">
              {formatDateTime(detailQuery.data.startsAt)} – {dayjs(detailQuery.data.endsAt).format('HH:mm')}
              {detailQuery.data.teacherEmployee && ` · ${detailQuery.data.teacherEmployee.fullName}`}
            </Typography.Paragraph>
            {detailQuery.data.description && <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{detailQuery.data.description}</Typography.Paragraph>}
            <div className="eyebrow" style={{ margin: '16px 0 8px' }}>
              Yozilganlar ({detailQuery.data.registrations.length} / {detailQuery.data.capacity})
            </div>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detailQuery.data.registrations}
              locale={{ emptyText: "Hali hech kim yozilmagan" }}
              columns={[
                { title: '#', render: (_, __, i) => i + 1, width: 40 },
                { title: "O'quvchi", render: (_, r) => r.student.fullName },
                { title: 'Telefon', render: (_, r) => r.student.phone ?? '—' },
                { title: 'Yozildi', render: (_, r) => formatDateTime(r.createdAt) },
              ]}
            />
            {canEdit && detailQuery.data.status === 'SCHEDULED' && dayjs(detailQuery.data.startsAt).isBefore(dayjs()) && (
              <Button style={{ marginTop: 16 }} onClick={() => statusMutation.mutate({ id: detailQuery.data!.id, status: 'COMPLETED' })}>
                O'tkazildi deb belgilash
              </Button>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
