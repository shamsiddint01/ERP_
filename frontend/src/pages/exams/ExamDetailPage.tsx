import { CheckCircleOutlined, EditOutlined, PercentageOutlined, StopOutlined, TrophyOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, DatePicker, Form, Input, Modal, Popconfirm, Select, Spin, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteExam, getExam, listExamAssessments, updateExam } from '../../api/exams';
import { getGroup } from '../../api/groups';
import { ActionBar } from '../../components/ActionBar';
import { AssessmentModal } from '../../components/AssessmentModal';
import { DetailHeader } from '../../components/DetailHeader';
import { DetailSection } from '../../components/DetailSection';
import { InfoGrid } from '../../components/InfoGrid';
import { PageErrorState } from '../../components/PageErrorState';
import { SummaryCard } from '../../components/SummaryCard';
import { palette } from '../../theme';
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

  if (examQuery.isError) {
    return <PageErrorState onRetry={() => examQuery.refetch()} />;
  }

  const exam = examQuery.data;
  if (!exam) return null;

  const canEdit = hasPermission('exams', 'EDIT');
  const canDelete = hasPermission('exams', 'DELETE');
  const canGrade = hasPermission('grades', 'CREATE') || hasPermission('grades', 'EDIT');

  return (
    <div>
      <DetailHeader
        backLabel="Imtihonlar ro'yxatiga qaytish"
        onBack={() => navigate('/exams')}
        title={exam.title}
        subtitle={
          <>
            {exam.course.name} · {exam.group.name} · {new Date(exam.date).toLocaleDateString('uz-UZ')}
          </>
        }
        actions={
          <ActionBar>
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
                <Button loading={deleteMutation.isPending} danger icon={<StopOutlined />}>
                  O'chirish
                </Button>
              </Popconfirm>
            )}
          </ActionBar>
        }
      >
        <InfoGrid
          items={[
            { label: 'Maksimal ball', value: Number(exam.maxScore) },
            { label: "O'tish balli", value: Number(exam.passingScore) },
            { label: "O'qituvchi", value: exam.teacherEmployee?.fullName },
          ]}
        />
      </DetailHeader>

      <SummaryCard
        items={[
          { icon: <CheckCircleOutlined />, label: 'Baholangan', value: stats.assessedCount, color: palette.info, formatter: () => `${stats.assessedCount}/${stats.totalEnrolled}` },
          { icon: <TrophyOutlined />, label: "O'rtacha ball (%)", value: stats.average, color: palette.primary, formatter: (v) => v.toFixed(2) },
          {
            icon: <PercentageOutlined />,
            label: "O'tish darajasi (%)",
            value: stats.passRate,
            color: stats.passRate >= 60 ? palette.success : palette.error,
            formatter: (v) => v.toFixed(2),
          },
        ]}
      />

      <DetailSection title="O'quvchilar va baholar">
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
      </DetailSection>

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
