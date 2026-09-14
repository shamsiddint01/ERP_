import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, InputNumber, Modal } from 'antd';
import { useEffect } from 'react';
import { createAssessment, updateAssessment } from '../api/exams';

interface AssessmentModalProps {
  open: boolean;
  onClose: () => void;
  examId: string;
  maxScore: number;
  /** Present when editing an existing assessment; absent when entering a fresh score for a not-yet-graded student. */
  assessment?: { id: string; score: number; comment: string | null } | null;
  /** Required when creating (assessment is absent). */
  student?: { id: string; fullName: string; studentCode: string };
}

interface FormValues {
  score: number;
  comment?: string;
}

export function AssessmentModal({ open, onClose, examId, maxScore, assessment, student }: AssessmentModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    if (open) form.setFieldsValue({ score: assessment?.score, comment: assessment?.comment ?? undefined });
  }, [open, assessment, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      assessment ? updateAssessment(assessment.id, values) : createAssessment(examId, { studentId: student!.id, score: values.score, comment: values.comment }),
    onSuccess: () => {
      message.success('Baho saqlandi');
      queryClient.invalidateQueries({ queryKey: ['exam-assessments', examId] });
      queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      queryClient.invalidateQueries({ queryKey: ['student-grades'] });
      queryClient.invalidateQueries({ queryKey: ['student-progress'] });
      queryClient.invalidateQueries({ queryKey: ['group-results'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Bahoni saqlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={`Baho — ${student?.fullName ?? ''}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="score" label={`Ball (0 dan ${maxScore} gacha)`} rules={[{ required: true }]}>
          <InputNumber min={0} max={maxScore} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="comment" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
