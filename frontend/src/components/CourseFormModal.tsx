import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useEffect } from 'react';
import { listCourseCategories } from '../api/courseCategories';
import { createCourse, updateCourse, type CoursePayload } from '../api/courses';
import { FormSection } from './FormSection';
import type { CourseDetail, CourseLevel, CourseStatus } from '../types';

interface CourseFormModalProps {
  open: boolean;
  onClose: () => void;
  course?: CourseDetail;
}

interface FormValues {
  categoryId?: string;
  name: string;
  code: string;
  description?: string;
  level?: CourseLevel;
  durationWeeks?: number;
  lessonDurationMinutes?: number;
  defaultTuition?: number;
  status?: CourseStatus;
}

const LEVEL_OPTIONS: Array<{ value: CourseLevel; label: string }> = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'ELEMENTARY', label: 'Elementary' },
  { value: 'PRE_INTERMEDIATE', label: 'Pre-Intermediate' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'UPPER_INTERMEDIATE', label: 'Upper-Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
];

const STATUS_OPTIONS: Array<{ value: CourseStatus; label: string }> = [
  { value: 'DRAFT', label: 'Qoralama' },
  { value: 'ACTIVE', label: 'Faol' },
  { value: 'INACTIVE', label: 'Nofaol' },
  { value: 'ARCHIVED', label: 'Arxivlangan' },
];

export function CourseFormModal({ open, onClose, course }: CourseFormModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const isEdit = !!course;

  const categoriesQuery = useQuery({
    queryKey: ['course-categories', { pageSize: 100, forSelect: true }],
    queryFn: () => listCourseCategories({ pageSize: 100, status: 'ACTIVE' }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (course) {
      form.setFieldsValue({
        categoryId: course.categoryId ?? undefined,
        name: course.name,
        code: course.code,
        description: course.description ?? undefined,
        level: course.level ?? undefined,
        durationWeeks: course.durationWeeks ?? undefined,
        lessonDurationMinutes: course.lessonDurationMinutes,
        defaultTuition: Number(course.defaultTuition),
        status: course.status,
      });
    } else {
      form.resetFields();
    }
  }, [open, course, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: CoursePayload = values;
      return isEdit ? updateCourse(course!.id, payload) : createCourse(payload);
    },
    onSuccess: () => {
      message.success(isEdit ? 'Kurs yangilandi' : 'Kurs yaratildi');
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['course', course!.id] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Kursni saqlab bo'lmadi");
    },
  });

  return (
    <Modal
      title={isEdit ? 'Kursni tahrirlash' : 'Yangi kurs'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={600}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)} initialValues={{ lessonDurationMinutes: 90 }}>
        <FormSection title="Asosiy ma'lumotlar">
          <Form.Item name="categoryId" label="Kategoriya">
            <Select
              allowClear
              loading={categoriesQuery.isLoading}
              options={categoriesQuery.data?.items.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Form.Item name="name" label="Nomi" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="Kod" rules={[{ required: true }]}>
            <Input placeholder="Masalan: ENG-GEN" />
          </Form.Item>
          <Form.Item name="description" label="Tavsif" style={{ marginBottom: 0 }}>
            <Input.TextArea />
          </Form.Item>
        </FormSection>

        <FormSection title="Konfiguratsiya">
          <Form.Item name="level" label="Daraja">
            <Select allowClear options={LEVEL_OPTIONS} />
          </Form.Item>
          <Form.Item name="durationWeeks" label="Davomiyligi (hafta)">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="lessonDurationMinutes" label="Dars davomiyligi (daqiqa)" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="defaultTuition" label="Standart to'lov summasi (so'm)" style={{ marginBottom: isEdit ? undefined : 0 }}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          {isEdit && (
            <Form.Item name="status" label="Status" style={{ marginBottom: 0 }}>
              <Select options={STATUS_OPTIONS} />
            </Form.Item>
          )}
        </FormSection>
      </Form>
    </Modal>
  );
}
