import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Modal, Typography } from 'antd';
import dayjs from 'dayjs';
import { generateLessons } from '../api/schedules';
import type { ScheduleDetail } from '../types';

function summaryMessage(generatedCount: number, skippedCount: number): string {
  if (skippedCount === 0) return `${generatedCount} ta yangi dars yaratildi`;
  return `${generatedCount} ta yangi dars yaratildi, ${skippedCount} tasi allaqachon mavjud bo'lgani uchun o'tkazib yuborildi`;
}

interface GenerateLessonsModalProps {
  open: boolean;
  onClose: () => void;
  schedule: ScheduleDetail;
}

interface FormValues {
  fromDate?: dayjs.Dayjs;
  toDate?: dayjs.Dayjs;
}

/** Darslarni yaratish — materializes concrete Lesson rows for this Schedule's weekly recurrence over a date range. Safe to run repeatedly: already-generated dates are silently skipped (server-side unique constraint), never duplicated. */
export function GenerateLessonsModal({ open, onClose, schedule }: GenerateLessonsModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      generateLessons(schedule.id, {
        fromDate: values.fromDate ? values.fromDate.format('YYYY-MM-DD') : undefined,
        toDate: values.toDate ? values.toDate.format('YYYY-MM-DD') : undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
      queryClient.invalidateQueries({ queryKey: ['schedule', schedule.id] });
      form.resetFields();
      onClose();
      message.success(summaryMessage(result.generatedCount, result.skippedCount));
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Darslarni yaratib bo'lmadi");
    },
  });

  return (
    <Modal
      title="Darslarni yaratish"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      okText="Yaratish"
    >
      <Typography.Paragraph type="secondary">
        Ushbu dars jadvali asosida haqiqiy dars kunlari (Lesson) yaratiladi. Sanalarni bo'sh qoldirsangiz, jadval boshlanish sanasidan ~12 haftalik davr uchun
        yaratiladi.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="fromDate" label="Sanadan (ixtiyoriy)">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="toDate" label="Sanagacha (ixtiyoriy)">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
