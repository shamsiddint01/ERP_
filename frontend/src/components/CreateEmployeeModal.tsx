import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { listDepartments } from '../api/departments';
import { createEmployee, listEmployees } from '../api/employees';
import { listPositions } from '../api/positions';

interface CreateEmployeeModalProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  firstName: string;
  lastName: string;
  middleName?: string;
  phone: string;
  email?: string;
  dateOfBirth?: dayjs.Dayjs;
  address?: string;
  departmentId?: string;
  positionId?: string;
  managerId?: string;
  hireDate: dayjs.Dayjs;
  salary?: number;
  notes?: string;
}

export function CreateEmployeeModal({ open, onClose }: CreateEmployeeModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [departmentId, setDepartmentId] = useState<string | undefined>();

  const departmentsQuery = useQuery({
    queryKey: ['departments', { pageSize: 100 }],
    queryFn: () => listDepartments({ pageSize: 100 }),
    enabled: open,
  });
  const positionsQuery = useQuery({
    queryKey: ['positions', { departmentId, pageSize: 100 }],
    queryFn: () => listPositions({ departmentId, pageSize: 100 }),
    enabled: open && !!departmentId,
  });
  const employeesQuery = useQuery({
    queryKey: ['employees', { pageSize: 100, forManagerSelect: true }],
    queryFn: () => listEmployees({ pageSize: 100 }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createEmployee({
        ...values,
        dateOfBirth: values.dateOfBirth ? values.dateOfBirth.format('YYYY-MM-DD') : undefined,
        hireDate: values.hireDate.format('YYYY-MM-DD'),
      }),
    onSuccess: () => {
      message.success('Xodim yaratildi');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees-overview'] });
      form.resetFields();
      setDepartmentId(undefined);
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Xodimni saqlab bo‘lmadi');
    },
  });

  return (
    <Modal
      title="Yangi xodim"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={640}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)} initialValues={{ hireDate: dayjs() }}>
        <Form.Item name="firstName" label="Ism" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="lastName" label="Familiya" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="middleName" label="Otasining ismi">
          <Input />
        </Form.Item>
        <Form.Item name="phone" label="Telefon" rules={[{ required: true }]}>
          <Input placeholder="+998901234567" />
        </Form.Item>
        <Form.Item name="email" label="Email">
          <Input />
        </Form.Item>
        <Form.Item name="dateOfBirth" label="Tug'ilgan sana">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="address" label="Manzil">
          <Input />
        </Form.Item>
        <Form.Item name="departmentId" label="Bo'lim">
          <Select
            allowClear
            loading={departmentsQuery.isLoading}
            options={departmentsQuery.data?.items.map((d) => ({ value: d.id, label: d.name }))}
            onChange={(value) => {
              setDepartmentId(value);
              form.setFieldValue('positionId', undefined);
            }}
          />
        </Form.Item>
        <Form.Item name="positionId" label="Lavozim">
          <Select
            allowClear
            disabled={!departmentId}
            loading={positionsQuery.isLoading}
            options={positionsQuery.data?.items.map((p) => ({ value: p.id, label: p.title }))}
            placeholder={departmentId ? 'Lavozimni tanlang' : "Avval bo'limni tanlang"}
          />
        </Form.Item>
        <Form.Item name="managerId" label="Rahbar">
          <Select
            allowClear
            loading={employeesQuery.isLoading}
            options={employeesQuery.data?.items.map((e) => ({ value: e.id, label: e.fullName }))}
          />
        </Form.Item>
        <Form.Item name="hireDate" label="Ishga qabul qilingan sana" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="salary" label="Maosh">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="notes" label="Izoh">
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
