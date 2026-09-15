import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, Select, Space, Spin, Statistic, Table, Typography } from 'antd';
import { EmptyState } from '../../components/EmptyState';
import dayjs from 'dayjs';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listEnrollments } from '../../api/enrollments';
import { getLesson } from '../../api/lessons';
import { bulkMarkAttendance, listStudentAttendance, type BulkAttendanceEntry } from '../../api/studentAttendance';
import { PageErrorState } from '../../components/PageErrorState';
import { ATTENDANCE_STATUS_OPTIONS } from '../../utils/attendanceStatus';
import type { EnrollmentListItem, StudentAttendanceStatus } from '../../types';
import { palette } from '../../theme';

interface FormValues {
  status?: Record<string, StudentAttendanceStatus>;
  notes?: Record<string, string>;
}

/** Mirrors StudentAttendanceService's own eligibility rule client-side, purely for display — the backend re-validates authoritatively on save regardless. */
function isEligible(enrollment: EnrollmentListItem, lessonDate: Date): boolean {
  if (enrollment.status === 'CANCELLED') return false;
  if (dayjs(enrollment.startDate).isAfter(lessonDate)) return false;
  if (enrollment.endDate && dayjs(enrollment.endDate).isBefore(lessonDate)) return false;
  return true;
}

export function LessonAttendancePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const watched = Form.useWatch([], form) as FormValues | undefined;

  const lessonQuery = useQuery({ queryKey: ['lesson', id], queryFn: () => getLesson(id!), enabled: !!id });
  const groupId = lessonQuery.data?.groupId;
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', { groupId, pageSize: 100, forAttendance: true }],
    queryFn: () => listEnrollments({ groupId, pageSize: 100 }),
    enabled: !!groupId,
  });
  const existingQuery = useQuery({
    queryKey: ['student-attendance', { lessonId: id, pageSize: 100, forAttendance: true }],
    queryFn: () => listStudentAttendance({ lessonId: id, pageSize: 100 }),
    enabled: !!id,
  });

  const roster = useMemo(() => {
    if (!lessonQuery.data || !enrollmentsQuery.data) return [];
    const lessonDate = new Date(lessonQuery.data.scheduledStart);
    return enrollmentsQuery.data.items.filter((e) => isEligible(e, lessonDate));
  }, [lessonQuery.data, enrollmentsQuery.data]);

  useEffect(() => {
    if (!existingQuery.data || roster.length === 0) return;
    const existingByStudent = new Map(existingQuery.data.items.map((r) => [r.studentId, r]));
    const status: Record<string, StudentAttendanceStatus> = {};
    const notes: Record<string, string> = {};
    for (const enrollment of roster) {
      const existing = existingByStudent.get(enrollment.student.id);
      status[enrollment.student.id] = existing?.status ?? 'PRESENT';
      if (existing?.notes) notes[enrollment.student.id] = existing.notes;
    }
    form.setFieldsValue({ status, notes });
  }, [existingQuery.data, roster, form]);

  const bulkMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const entries: BulkAttendanceEntry[] = roster.map((enrollment) => ({
        studentId: enrollment.student.id,
        status: values.status?.[enrollment.student.id] ?? 'PRESENT',
        notes: values.notes?.[enrollment.student.id] || undefined,
      }));
      return bulkMarkAttendance(id!, entries);
    },
    onSuccess: (result) => {
      message.success(`Davomat saqlandi (${result.markedCount} ta o'quvchi)`);
      queryClient.invalidateQueries({ queryKey: ['student-attendance'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Davomatni saqlab bo'lmadi");
    },
  });

  const counts = useMemo(() => {
    const values = Object.values(watched?.status ?? {});
    return {
      present: values.filter((v) => v === 'PRESENT').length,
      absent: values.filter((v) => v === 'ABSENT').length,
      late: values.filter((v) => v === 'LATE').length,
      excused: values.filter((v) => v === 'EXCUSED').length,
    };
  }, [watched]);

  if (lessonQuery.isLoading || enrollmentsQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (lessonQuery.isError) {
    return <PageErrorState onRetry={() => lessonQuery.refetch()} />;
  }

  const lesson = lessonQuery.data;
  if (!lesson) return null;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(`/lessons/${id}`)} style={{ marginBottom: 8 }}>
        Darsga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {lesson.group.name} — Davomat
        </Typography.Title>
        <Typography.Text type="secondary" style={{ display: 'block' }}>
          {dayjs(lesson.scheduledStart).format('DD.MM.YYYY HH:mm')} – {dayjs(lesson.scheduledEnd).format('HH:mm')} · {lesson.teacherEmployee?.fullName ?? "O'qituvchisiz"}
        </Typography.Text>

        <Space size={32} style={{ marginTop: 16 }}>
          <Statistic title="Jami o'quvchilar" value={roster.length} />
          <Statistic title="Keldi" value={counts.present} styles={{ content: { color: palette.success } }} />
          <Statistic title="Kelmadi" value={counts.absent} styles={{ content: { color: palette.error } }} />
          <Statistic title="Kech qoldi" value={counts.late} styles={{ content: { color: palette.warning } }} />
          <Statistic title="Sababli" value={counts.excused} styles={{ content: { color: palette.info } }} />
        </Space>
      </Card>

      <Card>
        {lesson.status === 'CANCELLED' ? (
          <EmptyState title="Bekor qilingan darsga davomat belgilab bo'lmaydi" />
        ) : roster.length === 0 ? (
          <EmptyState title="Ushbu darsga yozilgan o'quvchilar topilmadi" />
        ) : (
          <Form form={form} onFinish={(values) => bulkMutation.mutate(values)}>
            <Table
              rowKey={(record) => record.student.id}
              dataSource={roster}
              pagination={false}
              columns={[
                { title: 'Kod', render: (_, record) => record.student.studentCode },
                { title: "F.I.Sh.", render: (_, record) => record.student.fullName },
                {
                  title: 'Status',
                  width: 200,
                  render: (_, record) => (
                    <Form.Item name={['status', record.student.id]} rules={[{ required: true, message: 'Tanlang' }]} style={{ marginBottom: 0 }}>
                      <Select options={ATTENDANCE_STATUS_OPTIONS} style={{ width: 160 }} />
                    </Form.Item>
                  ),
                },
                {
                  title: 'Izoh',
                  render: (_, record) => (
                    <Form.Item name={['notes', record.student.id]} style={{ marginBottom: 0 }}>
                      <Input placeholder="Izoh (ixtiyoriy)" />
                    </Form.Item>
                  ),
                },
              ]}
            />
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={bulkMutation.isPending} style={{ marginTop: 16 }}>
              Saqlash
            </Button>
          </Form>
        )}
      </Card>
    </div>
  );
}
