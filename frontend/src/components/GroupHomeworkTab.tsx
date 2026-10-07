import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Progress, Space, Table, Tag } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { createHomework, deleteHomework, listHomework, updateHomework } from '../api/homework';
import { useAuthStore } from '../store/auth.store';
import { palette } from '../theme';
import type { HomeworkListItem } from '../types';
import { formatDateTime } from '../utils/format';
import { EmptyState } from './EmptyState';
import { HomeworkSubmissionsDrawer } from './HomeworkSubmissionsDrawer';

interface HomeworkForm {
  title: string;
  description?: string;
  dueDate: Dayjs;
  maxScore?: number;
}

function apiError(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(detail) ? detail.join(', ') : (detail ?? fallback);
}

/** Group detail → "Uy ishlari": assign homework to the group, see who submitted, and grade. */
export function GroupHomeworkTab({ groupId }: { groupId: string }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canCreate = hasPermission('homework', 'CREATE');
  const canEdit = hasPermission('homework', 'EDIT');
  const canDelete = hasPermission('homework', 'DELETE');

  const [editing, setEditing] = useState<HomeworkListItem | 'new' | null>(null);
  const [reviewing, setReviewing] = useState<HomeworkListItem | null>(null);
  const [form] = Form.useForm<HomeworkForm>();

  const homeworkQuery = useQuery({ queryKey: ['homework', { groupId }], queryFn: () => listHomework({ groupId, pageSize: 100 }) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['homework'] });

  const saveMutation = useMutation({
    mutationFn: (values: HomeworkForm) => {
      const payload = { title: values.title, description: values.description || undefined, dueDate: values.dueDate.toISOString(), maxScore: values.maxScore };
      return editing === 'new' ? createHomework({ ...payload, groupId }) : updateHomework((editing as HomeworkListItem).id, payload);
    },
    onSuccess: () => {
      message.success(editing === 'new' ? 'Uy ishi berildi' : 'Uy ishi yangilandi');
      refresh();
      setEditing(null);
    },
    onError: (error) => message.error(apiError(error, "Saqlab bo'lmadi")),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteHomework,
    onSuccess: () => {
      message.success("Uy ishi o'chirildi");
      refresh();
    },
    onError: (error) => message.error(apiError(error, "O'chirib bo'lmadi")),
  });

  const openForm = (homework: HomeworkListItem | 'new') => setEditing(homework);
  const formInitialValues =
    editing === 'new' || !editing
      ? { dueDate: dayjs().add(2, 'day').hour(18).minute(0).second(0), maxScore: 100 }
      : { title: editing.title, description: editing.description ?? undefined, dueDate: dayjs(editing.dueDate), maxScore: editing.maxScore };

  return (
    <>
      {canCreate && (
        <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => openForm('new')}>
          Uy ishi berish
        </Button>
      )}
      <Table<HomeworkListItem>
        rowKey="id"
        size="small"
        loading={homeworkQuery.isLoading}
        dataSource={homeworkQuery.data?.items}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: <EmptyState title="Bu guruhga hali uy ishi berilmagan" /> }}
        onRow={(record) => ({ onClick: () => setReviewing(record), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: 'Vazifa',
            render: (_, r) => (
              <div>
                <div style={{ fontWeight: 600 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: palette.textMuted }}>{r.createdBy.fullName}</div>
              </div>
            ),
          },
          {
            title: 'Muddat',
            render: (_, r) => (
              <span style={{ color: dayjs(r.dueDate).isBefore(dayjs()) ? palette.textMuted : undefined }}>{formatDateTime(r.dueDate)}</span>
            ),
          },
          {
            title: 'Topshirdi',
            width: 170,
            render: (_, r) => (
              <Progress
                percent={r.rosterSize ? Math.round((r.submittedCount / r.rosterSize) * 100) : 0}
                size="small"
                format={() => `${r.submittedCount}/${r.rosterSize}`}
                strokeColor={palette.primary}
              />
            ),
          },
          {
            title: 'Baholandi',
            render: (_, r) =>
              r.submittedCount === 0 ? '—' : r.gradedCount === r.submittedCount ? <Tag color="green">Hammasi</Tag> : <Tag color="gold">{r.submittedCount - r.gradedCount} ta kutmoqda</Tag>,
          },
          {
            title: '',
            render: (_, r) => (
              <Space onClick={(e) => e.stopPropagation()}>
                {canEdit && <Button size="small" icon={<EditOutlined />} onClick={() => openForm(r)} aria-label="Tahrirlash" />}
                {canDelete && (
                  <Popconfirm title="Uy ishi o'chirilsinmi?" onConfirm={() => deleteMutation.mutate(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} aria-label="O'chirish" />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing === 'new' ? 'Uy ishi berish' : 'Uy ishini tahrirlash'}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okText="Saqlash"
        cancelText="Bekor qilish"
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
        width={600}
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
            <Input maxLength={200} placeholder="Masalan: Present Simple — 20 ta gap" />
          </Form.Item>
          <Form.Item name="description" label="Vazifa matni">
            <Input.TextArea autoSize={{ minRows: 4, maxRows: 12 }} maxLength={5000} placeholder="O'quvchi nima qilishi kerak..." />
          </Form.Item>
          <Space size={16} wrap>
            <Form.Item name="dueDate" label="Muddat" rules={[{ required: true, message: 'Muddatni tanlang' }]} style={{ marginBottom: 0 }}>
              <DatePicker showTime={{ format: 'HH:mm' }} format="DD.MM.YYYY HH:mm" />
            </Form.Item>
            <Form.Item name="maxScore" label="Maksimal ball" style={{ marginBottom: 0 }}>
              <InputNumber min={1} max={1000} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <HomeworkSubmissionsDrawer homework={reviewing} canGrade={canEdit} onClose={() => setReviewing(null)} />
    </>
  );
}
