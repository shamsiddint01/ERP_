import { CheckOutlined, LinkOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Form, Input, InputNumber, Modal, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { getHomeworkSubmissions, gradeSubmission } from '../api/homework';
import { palette } from '../theme';
import type { HomeworkListItem, HomeworkSubmissionsView } from '../types';
import { formatDateTime } from '../utils/format';
import { EmptyState } from './EmptyState';

function apiError(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(detail) ? detail.join(', ') : (detail ?? fallback);
}

/** Everyone on the group's roster with their answer (or "not submitted"), and grading — used by the group page and the teacher's Uy ishi page. */
export function HomeworkSubmissionsDrawer({ homework, canGrade, onClose }: { homework: HomeworkListItem | null; canGrade: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [grading, setGrading] = useState<HomeworkSubmissionsView['items'][number] | null>(null);
  const [form] = Form.useForm<{ score: number; feedback?: string }>();

  const submissionsQuery = useQuery({
    queryKey: ['homework-submissions', homework?.id],
    queryFn: () => getHomeworkSubmissions(homework!.id),
    enabled: !!homework,
  });

  const gradeMutation = useMutation({
    mutationFn: (values: { score: number; feedback?: string }) => gradeSubmission(grading!.submission!.id, values),
    onSuccess: () => {
      message.success('Baho qo\'yildi');
      queryClient.invalidateQueries({ queryKey: ['homework-submissions', homework?.id] });
      queryClient.invalidateQueries({ queryKey: ['homework'] });
      setGrading(null);
    },
    onError: (error) => message.error(apiError(error, "Baho qo'yib bo'lmadi")),
  });

  const items = submissionsQuery.data?.items ?? [];

  return (
    <Drawer title={homework?.title} open={!!homework} onClose={onClose} size={620} destroyOnHidden>
      {homework?.description && (
        <Typography.Paragraph type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
          {homework.description}
        </Typography.Paragraph>
      )}
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        Muddat: {homework && formatDateTime(homework.dueDate)} · Maks. ball: {homework?.maxScore}
      </div>
      {submissionsQuery.isLoading ? null : items.length === 0 ? (
        <EmptyState title="Guruhda o'quvchi yo'q" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => (
            <div key={item.student.id} style={{ padding: 14, borderRadius: 12, background: palette.surfaceRaised, border: `1px solid ${palette.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div>
                  <Typography.Text strong>{item.student.fullName}</Typography.Text>
                  <span style={{ fontSize: 12, color: palette.textMuted }}> · {item.student.studentCode}</span>
                </div>
                {!item.submission ? (
                  <Tag>Topshirmagan</Tag>
                ) : item.submission.status === 'GRADED' ? (
                  <Tag color="green">
                    {item.submission.score} / {homework?.maxScore}
                  </Tag>
                ) : (
                  <Space size={4}>
                    {item.late && <Tag color="orange">Kechikkan</Tag>}
                    <Tag color="blue">Topshirgan</Tag>
                  </Space>
                )}
              </div>
              {item.submission && (
                <>
                  <div style={{ fontSize: 12, color: palette.textMuted, margin: '4px 0 8px' }}>{formatDateTime(item.submission.submittedAt)}</div>
                  <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 6 }} ellipsis={{ rows: 4, expandable: true, symbol: "ko'proq" }}>
                    {item.submission.answerText}
                  </Typography.Paragraph>
                  {item.submission.link && (
                    <a href={item.submission.link} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginBottom: 6 }}>
                      <LinkOutlined /> {item.submission.link}
                    </a>
                  )}
                  {item.submission.feedback && <Typography.Text type="secondary">Izoh: {item.submission.feedback}</Typography.Text>}
                  {canGrade && (
                    <div style={{ marginTop: 8 }}>
                      <Button
                        size="small"
                        type={item.submission.status === 'GRADED' ? 'default' : 'primary'}
                        icon={<CheckOutlined />}
                        onClick={() => setGrading(item)}
                      >
                        {item.submission.status === 'GRADED' ? "Bahoni o'zgartirish" : 'Baholash'}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        title={grading ? `${grading.student.fullName} — baholash` : ''}
        open={!!grading}
        onCancel={() => setGrading(null)}
        onOk={() => form.submit()}
        okText="Saqlash"
        cancelText="Bekor qilish"
        confirmLoading={gradeMutation.isPending}
        destroyOnHidden
      >
        <Form
          key={grading?.submission?.id}
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ score: grading?.submission?.score ?? undefined, feedback: grading?.submission?.feedback ?? undefined }}
          onFinish={(values) => gradeMutation.mutate(values)}
        >
          <Form.Item name="score" label={`Ball (0 – ${homework?.maxScore})`} rules={[{ required: true, message: 'Ballni kiriting' }]}>
            <InputNumber min={0} max={homework?.maxScore} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="feedback" label="Izoh (ixtiyoriy)" style={{ marginBottom: 0 }}>
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={2000} placeholder="O'quvchiga fikringiz" />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}
