import { LockOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, Card, Form, Input, Typography } from 'antd';
import { changePassword, fetchCurrentUser } from '../api/auth';
import { useAuthStore } from '../store/auth.store';
import { formatDateTime } from '../utils/format';
import { ThemeModeSwitch } from './ThemeModeSwitch';

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** Light / dark mode — part of every role's Sozlamalar. */
export function AppearanceCard() {
  return (
    <Card title="Ko'rinish" style={{ height: '100%' }}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Tizim rangini tanlang. Tanlov shu brauzerda siz uchun saqlanadi.
      </Typography.Paragraph>
      <ThemeModeSwitch />
    </Card>
  );
}

/** Self-service password change — part of every role's Sozlamalar. Students and teachers may change it once per 12 hours. */
export function ChangePasswordCard() {
  const { message } = App.useApp();
  const [form] = Form.useForm<PasswordForm>();
  const availableAt = useAuthStore((state) => state.user?.passwordChangeAvailableAt);
  // The backend sends null once a change is allowed again (the server enforces it either way).
  const locked = !!availableAt;

  /** Re-read the profile so the 12-hour lock shows straight away. */
  const refreshProfile = async () => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken) useAuthStore.getState().setAuth(accessToken, await fetchCurrentUser());
  };

  const mutation = useMutation({
    mutationFn: (values: PasswordForm) => changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      message.success("Parol o'zgartirildi. Boshqa qurilmalardagi kirishlar yopildi");
      form.resetFields();
      void refreshProfile().catch(() => undefined);
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      message.error(Array.isArray(detail) ? detail.join(', ') : (detail ?? "Parolni o'zgartirib bo'lmadi"));
    },
  });

  return (
    <Card title="Parolni o'zgartirish" style={{ height: '100%' }}>
      {locked && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Parolni 12 soatda faqat bir marta o'zgartirish mumkin"
          description={`Keyingi imkoniyat: ${formatDateTime(availableAt!)}`}
        />
      )}
      <Form form={form} layout="vertical" requiredMark={false} disabled={locked} onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="currentPassword" label="Joriy parol" rules={[{ required: true, message: 'Joriy parolni kiriting' }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
        </Form.Item>
        <Form.Item name="newPassword" label="Yangi parol" rules={[{ required: true, message: 'Yangi parolni kiriting' }, { min: 8, message: "Kamida 8 ta belgi bo'lsin" }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="Yangi parolni takrorlang"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'Parolni takrorlang' },
            ({ getFieldValue }) => ({
              validator: (_, value) => (!value || value === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Parollar mos emas'))),
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          Saqlash
        </Button>
      </Form>
    </Card>
  );
}
