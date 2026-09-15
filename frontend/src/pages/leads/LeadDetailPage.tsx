import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SwapRightOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Empty, Form, Input, Popconfirm, Row, Select, Space, Spin, Tag, Timeline, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addLeadActivity, changeLeadStatus, deleteLead, getLead, type CreateLeadActivityPayload } from '../../api/leads';
import { ConvertLeadModal } from '../../components/ConvertLeadModal';
import { LeadFormModal } from '../../components/LeadFormModal';
import { PageErrorState } from '../../components/PageErrorState';
import { useAuthStore } from '../../store/auth.store';
import type { LeadActivityType, LeadStatus } from '../../types';

const STATUS_COLORS: Record<LeadStatus, string> = {
  NEW: 'blue',
  CONTACTED: 'gold',
  TRIAL_SCHEDULED: 'purple',
  TRIAL_COMPLETED: 'cyan',
  ENROLLED: 'green',
  LOST: 'red',
};
const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Yangi',
  CONTACTED: "Bog'lanildi",
  TRIAL_SCHEDULED: 'Sinov darsi belgilandi',
  TRIAL_COMPLETED: "Sinov darsi o'tdi",
  ENROLLED: "O'quvchiga aylandi",
  LOST: "Yo'qotildi",
};
// Mirrors LEAD_TRANSITIONS in backend/src/modules/leads/leads.service.ts — kept in sync by hand,
// same as every other status label/color map duplicated between this frontend and its API.
const NEXT_STATUSES: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['CONTACTED', 'LOST'],
  CONTACTED: ['TRIAL_SCHEDULED', 'LOST'],
  TRIAL_SCHEDULED: ['TRIAL_COMPLETED', 'LOST'],
  TRIAL_COMPLETED: ['LOST'],
  ENROLLED: [],
  LOST: ['CONTACTED'],
};
const ACTIVITY_TYPE_LABELS: Record<LeadActivityType, string> = {
  CALL: "Qo'ng'iroq",
  MESSAGE: 'Xabar',
  MEETING: 'Uchrashuv',
  TRIAL: 'Sinov darsi',
  NOTE: 'Izoh',
  FOLLOW_UP: "Keyingi qadam",
};

interface ActivityFormValues {
  type: LeadActivityType;
  description?: string;
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [activityForm] = Form.useForm<ActivityFormValues>();

  const leadQuery = useQuery({ queryKey: ['lead', id], queryFn: () => getLead(id!), enabled: !!id });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['lead', id] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
  }

  const statusMutation = useMutation({
    mutationFn: (status: LeadStatus) => changeLeadStatus(id!, status),
    onSuccess: () => {
      message.success('Status yangilandi');
      invalidate();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Statusni o'zgartirib bo'lmadi");
    },
  });

  const activityMutation = useMutation({
    mutationFn: (payload: CreateLeadActivityPayload) => addLeadActivity(id!, payload),
    onSuccess: () => {
      message.success("Faoliyat qo'shildi");
      activityForm.resetFields();
      invalidate();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Faoliyatni qo'shib bo'lmadi");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLead(id!),
    onSuccess: () => {
      message.success("Lid o'chirildi");
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      navigate('/leads');
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Lidni o'chirib bo'lmadi");
    },
  });

  if (leadQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (leadQuery.isError) {
    return <PageErrorState onRetry={() => leadQuery.refetch()} />;
  }

  const lead = leadQuery.data;
  if (!lead) return null;

  const canEdit = hasPermission('leads', 'EDIT');
  const canDelete = hasPermission('leads', 'DELETE');
  const isConverted = lead.status === 'ENROLLED' || !!lead.convertedStudent;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/leads')} style={{ marginBottom: 8 }}>
        Lidlar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {lead.fullName}
            </Typography.Title>
            <Typography.Text type="secondary">
              {lead.phone} · {lead.source ?? "Manba ko'rsatilmagan"}
            </Typography.Text>
          </Col>
          <Col>
            <Space wrap>
              <Tag color={STATUS_COLORS[lead.status]}>{STATUS_LABELS[lead.status]}</Tag>
              {canEdit && (
                <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                  Tahrirlash
                </Button>
              )}
              {canDelete && !isConverted && (
                <Popconfirm title="Lidni o'chirishni tasdiqlaysizmi?" onConfirm={() => deleteMutation.mutate()}>
                  <Button loading={deleteMutation.isPending} danger icon={<DeleteOutlined />}>
                    O'chirish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>

        {isConverted && lead.convertedStudent ? (
          <Card size="small" style={{ marginTop: 16, background: '#f6ffed', borderColor: '#b7eb8f' }}>
            <Typography.Text>
              Ushbu lid <strong>{lead.convertedStudent.fullName}</strong> ({lead.convertedStudent.studentCode}) o'quvchisiga aylantirilgan.{' '}
              <Typography.Link onClick={() => navigate(`/students/${lead.convertedStudent!.id}`)}>O'quvchi profilini ko'rish →</Typography.Link>
            </Typography.Text>
          </Card>
        ) : (
          canEdit && (
            <Space wrap style={{ marginTop: 16 }}>
              <Typography.Text type="secondary">Statusni o'zgartirish:</Typography.Text>
              {NEXT_STATUSES[lead.status].map((next) => (
                <Button key={next} size="small" icon={<SwapRightOutlined />} loading={statusMutation.isPending} onClick={() => statusMutation.mutate(next)}>
                  {STATUS_LABELS[next]}
                </Button>
              ))}
              <Button type="primary" icon={<UserAddOutlined />} onClick={() => setConvertOpen(true)}>
                O'quvchiga aylantirish
              </Button>
            </Space>
          )
        )}

        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }}>
          <Descriptions.Item label="Email">{lead.email ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Qiziqqan kurs">{lead.preferredCourse?.name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Qiziqqan filial">{lead.preferredBranch?.name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Mas'ul xodim">{lead.assignedEmployee?.fullName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Keyingi aloqa sanasi">
            {lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleString('uz-UZ') : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Yaratilgan sana">{new Date(lead.createdAt).toLocaleDateString('uz-UZ')}</Descriptions.Item>
          {lead.notes && (
            <Descriptions.Item label="Izoh" span={3}>
              {lead.notes}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title={`Faoliyatlar tarixi (${lead.activities.length})`}>
        {canEdit && (
          <Form
            form={activityForm}
            layout="inline"
            style={{ marginBottom: 16, rowGap: 8 }}
            onFinish={(values) => activityMutation.mutate(values)}
            initialValues={{ type: 'CALL' }}
          >
            <Form.Item name="type" rules={[{ required: true }]}>
              <Select style={{ width: 160 }} options={Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="description" style={{ flex: 1, minWidth: 240 }}>
              <Input placeholder="Izoh (ixtiyoriy)" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" icon={<PlusOutlined />} htmlType="submit" loading={activityMutation.isPending}>
                Qo'shish
              </Button>
            </Form.Item>
          </Form>
        )}

        {lead.activities.length ? (
          <Timeline
            items={lead.activities.map((activity) => ({
              content: (
                <>
                  <Typography.Text strong>{ACTIVITY_TYPE_LABELS[activity.type]}</Typography.Text>
                  {' — '}
                  <Typography.Text type="secondary">{new Date(activity.occurredAt).toLocaleString('uz-UZ')}</Typography.Text>
                  {activity.employee && <Typography.Text type="secondary"> · {activity.employee.fullName}</Typography.Text>}
                  {activity.description && <div>{activity.description}</div>}
                </>
              ),
            }))}
          />
        ) : (
          <Empty description="Faoliyatlar hali qayd etilmagan" />
        )}
      </Card>

      <LeadFormModal open={editOpen} onClose={() => setEditOpen(false)} lead={lead} />
      <ConvertLeadModal open={convertOpen} onClose={() => setConvertOpen(false)} lead={lead} />
    </div>
  );
}
