import { ArrowLeftOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Descriptions, Form, Input, Modal, Popconfirm, Row, Select, Space, Spin, Statistic, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteExam, getExam, listExamAssessments, updateExam } from '../../api/exams';
import { getGroup } from '../../api/groups';
import { AssessmentModal } from '../../components/AssessmentModal';
import { useAuthStore } from '../../store/auth.store';
import type { Assessment, ExamStatus } from '../../types';

const STATUS_COLORS: Record<ExamStatus, string> = { SCHEDULED: 'blue', COMPLETED: 'green', CANCELLED: 'default' };
const STATUS_LABELS: Record<ExamStatus, string> = { SCHEDULED: 'Rejalashtirilgan', COMPLETED: 'Yakunlangan', CANCELLED: 'Bekor qilingan' };

export function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [gradingTarget, setGradingTarget] = useState<{ student: { id: string; fullName: string; studentCode: string }; assessment: Assessment | null } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();

  const examQuery = useQuery({ queryKey: ['exam', id], queryFn: () => getExam(id!), enabled: !!id });
  const assessmentsQuery = useQuery({ queryKey: ['exam-assessments', id], queryFn: () => listExamAssessments(id!), enabled: !!id });
  const groupQuery = useQuery({ queryKey: ['group', examQuery.data?.groupId], queryFn: () => getGroup(examQuery.data!.groupId), enabled: !!examQuery.data });

  const updateMutation = useMutation({
    mutationFn: (values: { status?: ExamStatus; date?: dayjs.Dayjs; notes?: string }) =>
      updateExam(id!, { ...values, date: values.date?.toISOString() }),
    onSuccess: () => {
      message.success('Yangilandi');
      queryClient.invalidateQueries({ queryKey: ['exam', id] });
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      setEditOpen(false);
    },
    onError: () => message.error("Yangilab bo'lmadi"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteExam(id!),
    onSuccess: () => {
      message.success("Imtihon o'chirildi");
      navigate('/exams');
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "O'chirib bo'lmadi");
    },
  });

  const roster = useMemo(() => {
    if (!groupQuery.data || !assessmentsQuery.data) return [];
    const assessmentByStudent = new Map(assessmentsQuery.data.map((a) => [a.studentId, a]));
    return groupQuery.data.enrollments
      .filter((e) => e.status !== 'CANCELLED')
      .map((e) => ({ student: e.student, assessment: assessmentByStudent.get(e.studentId) ?? null }));
  }, [groupQuery.data, assessmentsQuery.data]);

  const stats = useMemo(() => {
    const assessed = assessmentsQuery.data ?? [];
    const average = assessed.length ? Math.round((assessed.reduce((sum, a) => sum + Number(a.percentage), 0) / assessed.length) * 100) / 100 : 0;
    const passCount = examQuery.data ? assessed.filter((a) => Number(a.score) >= Number(examQuery.data!.passingScore)).length : 0;
    const passRate = assessed.length ? Math.round((passCount / assessed.length) * 10000) / 100 : 0;
    return { average, passRate, assessedCount: assessed.length, totalEnrolled: roster.length };
  }, [assessmentsQuery.data, examQuery.data, roster.length]);

  if (examQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const exam = examQuery.data;
  if (!exam) return null;

  const canEdit = hasPermission('exams', 'EDIT');
  const canDelete = hasPermission('exams', 'DELETE');
  const canGrade = hasPermission('grades', 'CREATE') || hasPermission('grades', 'EDIT');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/exams')} style={{ marginBottom: 8 }}>
        Imtihonlar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {exam.title}
            </Typography.Title>
            <Typography.Text type="secondary">
              {exam.course.name} · {exam.group.name} · {new Date(exam.date).toLocaleDateString('uz-UZ')}
            </Typography.Text>
          </Col>
          <Col>
            <Space>
              <Tag color={STATUS_COLORS[exam.status]}>{STATUS_LABELS[exam.status]}</Tag>
              {canEdit && (
                <Button
                  icon={<EditOutlined />}
                  onClick={() => {
                    form.setFieldsValue({ status: exam.status, date: dayjs(exam.date), notes: exam.notes ?? undefined });
                    setEditOpen(true);
                  }}
                >
                  Tahrirlash
                </Button>
              )}
              {canDelete && exam._count.assessments === 0 && (
                <Popconfirm title="Imtihonni o'chirish?" onConfirm={() => deleteMutation.mutate()}>
                  <Button danger icon={<StopOutlined />} loading={deleteMutation.isPending}>
                    O'chirish
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>
        <Descriptions column={3} style={{ marginTop: 16 }} size="small">
          <Descriptions.Item label="Maksimal ball">{Number(exam.maxScore)}</Descriptions.Item>
          <Descriptions.Item label="O'tish balli">{Number(exam.passingScore)}</Descriptions.Item>
          <Descriptions.Item label="O'qituvchi">{exam.teacherEmployee?.fullName ?? '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Baholangan" value={`${stats.assessedCount}/${stats.totalEnrolled}`} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="O'rtacha ball (%)" value={stats.average} precision={2} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="O'tish darajasi (%)" value={stats.passRate} precision={2} valueStyle={{ color: stats.passRate >= 60 ? '#3f8600' : '#cf1322' }} />
          </Card>
        </Col>
      </Row>

      <Card title="O'quvchilar va baholar">
        <Table
          rowKey={(row) => row.student.id}
          loading={groupQuery.isLoading || assessmentsQuery.isLoading}
          dataSource={roster}
          pagination={false}
          columns={[
            { title: 'O\'quvchi', render: (_, row) => `${row.student.fullName} (${row.student.studentCode})` },
            { title: 'Ball', render: (_, row) => (row.assessment ? Number(row.assessment.score) : '—') },
            { title: 'Foiz', render: (_, row) => (row.assessment ? `${Number(row.assessment.percentage)}%` : '—') },
            { title: 'Baho', render: (_, row) => (row.assessment ? row.assessment.grade : '—') },
            {
              title: "O'tdi/Yiqildi",
              render: (_, row) =>
                row.assessment ? (
                  <Tag color={Number(row.assessment.score) >= Number(exam.passingScore) ? 'green' : 'red'}>
                    {Number(row.assessment.score) >= Number(exam.passingScore) ? "O'tdi" : 'Yiqildi'}
                  </Tag>
                ) : (
                  '—'
                ),
            },
            { title: 'Izoh', render: (_, row) => row.assessment?.comment ?? '—' },
            {
              title: 'Amallar',
              render: (_, row) =>
                canGrade && (
                  <Button size="small" onClick={() => setGradingTarget({ student: row.student, assessment: row.assessment })}>
                    {row.assessment ? 'Tahrirlash' : 'Baho qo\'yish'}
                  </Button>
                ),
            },
          ]}
        />
      </Card>

      {gradingTarget && (
        <AssessmentModal
          open={!!gradingTarget}
          onClose={() => setGradingTarget(null)}
          examId={exam.id}
          maxScore={Number(exam.maxScore)}
          student={gradingTarget.student}
          assessment={gradingTarget.assessment ? { id: gradingTarget.assessment.id, score: Number(gradingTarget.assessment.score), comment: gradingTarget.assessment.comment } : null}
        />
      )}

      <Modal title="Imtihonni tahrirlash" open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => form.submit()} confirmLoading={updateMutation.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(values) => updateMutation.mutate(values)}>
          <Form.Item name="date" label="Sana">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="notes" label="Izoh">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
