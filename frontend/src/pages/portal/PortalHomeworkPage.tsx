import { CheckCircleFilled, EditOutlined, LinkOutlined, SendOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, Modal, Segmented, Skeleton, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { getPortalHomework, submitHomework } from '../../api/portal';
import { EmptyState } from '../../components/EmptyState';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { palette } from '../../theme';
import type { PortalHomework } from '../../types';
import { formatDateTime } from '../../utils/format';
import { HOMEWORK_STATE, dueLabel } from './portalLabels';

type Filter = 'todo' | 'submitted' | 'graded' | 'all';

const FILTERS: Record<Filter, (h: PortalHomework) => boolean> = {
  todo: (h) => h.state === 'PENDING' || h.state === 'OVERDUE',
  submitted: (h) => h.state === 'SUBMITTED',
  graded: (h) => h.state === 'GRADED',
  all: () => true,
};

function apiError(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(detail) ? detail.join(', ') : (detail ?? fallback);
}

export function PortalHomeworkPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('todo');
  const [answering, setAnswering] = useState<PortalHomework | null>(null);
  const [form] = Form.useForm<{ answerText: string; link?: string }>();

  const homeworkQuery = useQuery({ queryKey: ['portal', 'homework'], queryFn: getPortalHomework });

  const submitMutation = useMutation({
    mutationFn: (values: { answerText: string; link?: string }) => submitHomework(answering!.id, { answerText: values.answerText, link: values.link || undefined }),
    onSuccess: () => {
      message.success('Javobingiz topshirildi');
      queryClient.invalidateQueries({ queryKey: ['portal'] });
      setAnswering(null);
    },
    onError: (error) => message.error(apiError(error, "Topshirib bo'lmadi")),
  });

  const counts = useMemo(() => {
    const items = homeworkQuery.data ?? [];
    return Object.fromEntries((Object.keys(FILTERS) as Filter[]).map((key) => [key, items.filter(FILTERS[key]).length])) as Record<Filter, number>;
  }, [homeworkQuery.data]);

  if (homeworkQuery.isError) return <PageErrorState onRetry={() => homeworkQuery.refetch()} />;

  const visible = (homeworkQuery.data ?? []).filter(FILTERS[filter]);


  return (
    <div>
      <PageHeader title="Uy ishi" subtitle="O'qituvchilaringiz bergan vazifalar" />

      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        style={{ marginBottom: 16 }}
        options={[
          { value: 'todo', label: `Bajarilmagan (${counts.todo ?? 0})` },
          { value: 'submitted', label: `Topshirilgan (${counts.submitted ?? 0})` },
          { value: 'graded', label: `Baholangan (${counts.graded ?? 0})` },
          { value: 'all', label: 'Barchasi' },
        ]}
      />

      {homeworkQuery.isLoading ? (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState title={filter === 'todo' ? "Bajarilmagan uy ishi yo'q" : "Bu yerda hozircha hech narsa yo'q"} />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visible.map((hw) => {
            const state = HOMEWORK_STATE[hw.state];
            const canAnswer = hw.state !== 'GRADED';
            return (
              <Card key={hw.id} styles={{ body: { padding: 20 } }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Space size={8} wrap style={{ marginBottom: 4 }}>
                      <Tag color={state.color}>{state.label}</Tag>
                      {hw.late && <Tag color="orange">Kechikib topshirilgan</Tag>}
                      <span className="eyebrow">{hw.group.name}</span>
                    </Space>
                    <Typography.Title level={5} style={{ margin: '4px 0' }}>
                      {hw.title}
                    </Typography.Title>
                    {hw.description && (
                      <Typography.Paragraph type="secondary" style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                        {hw.description}
                      </Typography.Paragraph>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="eyebrow">Muddat</div>
                    <div style={{ fontWeight: 700 }}>{formatDateTime(hw.dueDate)}</div>
                    {(hw.state === 'PENDING' || hw.state === 'OVERDUE') && (
                      <div style={{ fontSize: 12, color: hw.state === 'OVERDUE' ? palette.error : palette.primary, fontWeight: 600 }}>{dueLabel(hw.dueDate)}</div>
                    )}
                  </div>
                </div>

                {hw.submission && (
                  <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: palette.surfaceRaised, border: `1px solid ${palette.border}` }}>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>
                      Mening javobim · {formatDateTime(hw.submission.submittedAt)}
                    </div>
                    <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: hw.submission.link ? 6 : 0 }} ellipsis={{ rows: 3, expandable: true, symbol: "ko'proq" }}>
                      {hw.submission.answerText}
                    </Typography.Paragraph>
                    {hw.submission.link && (
                      <a href={hw.submission.link} target="_blank" rel="noopener noreferrer">
                        <LinkOutlined /> {hw.submission.link}
                      </a>
                    )}
                  </div>
                )}

                {hw.submission?.status === 'GRADED' && (
                  <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: 'rgba(61, 214, 140, 0.08)', border: '1px solid rgba(61, 214, 140, 0.25)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <CheckCircleFilled style={{ color: palette.success, fontSize: 20, marginTop: 2 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>
                        {hw.submission.score} / {hw.maxScore}
                      </div>
                      {hw.submission.feedback && <Typography.Text type="secondary">{hw.submission.feedback}</Typography.Text>}
                    </div>
                  </div>
                )}

                {canAnswer && (
                  <div style={{ marginTop: 14 }}>
                    <Button type={hw.submission ? 'default' : 'primary'} icon={hw.submission ? <EditOutlined /> : <SendOutlined />} onClick={() => setAnswering(hw)}>
                      {hw.submission ? "Javobni o'zgartirish" : 'Javob yozish'}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        title={answering?.title}
        open={!!answering}
        onCancel={() => setAnswering(null)}
        onOk={() => form.submit()}
        okText="Topshirish"
        cancelText="Bekor qilish"
        confirmLoading={submitMutation.isPending}
        destroyOnHidden
        width={620}
      >
        {answering?.description && (
          <Typography.Paragraph type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
            {answering.description}
          </Typography.Paragraph>
        )}
        <Form
          key={answering?.id}
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ answerText: answering?.submission?.answerText ?? '', link: answering?.submission?.link ?? undefined }}
          onFinish={(values) => submitMutation.mutate(values)}
        >
          <Form.Item name="answerText" label="Javobingiz" rules={[{ required: true, whitespace: true, message: 'Javobni yozing' }]}>
            <Input.TextArea autoSize={{ minRows: 6, maxRows: 16 }} placeholder="Javobingizni shu yerga yozing..." maxLength={10000} showCount />
          </Form.Item>
          <Form.Item
            name="link"
            label="Havola (ixtiyoriy)"
            extra="Masalan: Google Drive'dagi fayl yoki rasmga havola"
            rules={[{ type: 'url', message: "To'g'ri havola kiriting (https://...)" }]}
            style={{ marginBottom: 0 }}
          >
            <Input prefix={<LinkOutlined />} placeholder="https://" allowClear />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
