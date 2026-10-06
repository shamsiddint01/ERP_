import { LockOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Avatar, Button, Card, Col, Descriptions, Form, Input, Row, Skeleton, Typography } from 'antd';
import { changePassword } from '../../api/auth';
import { getPortalOverview } from '../../api/portal';
import { PageHeader } from '../../components/PageHeader';
import { useAuthStore } from '../../store/auth.store';
import { avatarColor } from '../../utils/avatarColor';
import { formatDate } from '../../utils/format';

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function PortalSettingsPage() {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const [form] = Form.useForm<PasswordForm>();
  const overviewQuery = useQuery({ queryKey: ['portal', 'overview'], queryFn: getPortalOverview });
  const student = overviewQuery.data?.student;

  const passwordMutation = useMutation({
    mutationFn: (values: PasswordForm) => changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      message.success("Parol o'zgartirildi. Boshqa qurilmalardagi kirishlar yopildi");
      form.resetFields();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      message.error(Array.isArray(detail) ? detail.join(', ') : (detail ?? "Parolni o'zgartirib bo'lmadi"));
    },
  });

  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader title="Sozlamalar" />
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={12}>
          <Card title="Profil" style={{ height: '100%' }}>
            {!student ? (
              <Skeleton active />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                  <Avatar size={56} style={{ background: avatarColor(student.fullName), fontSize: 22, fontWeight: 700 }}>
                    {student.fullName.charAt(0)}
                  </Avatar>
                  <div>
                    <Typography.Title level={5} style={{ margin: 0 }}>
                      {student.fullName}
                    </Typography.Title>
                    <Typography.Text type="secondary">Login: {user?.username}</Typography.Text>
                  </div>
                </div>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="O'quvchi kodi">{student.studentCode}</Descriptions.Item>
                  <Descriptions.Item label="Telefon">{student.phone ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Email">{student.email ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Filial">{student.branch?.name ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Ro'yxatdan o'tgan">{formatDate(student.registrationDate)}</Descriptions.Item>
                </Descriptions>
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
                  Ma'lumotlarni o'zgartirish uchun markaz ma'muriyatiga murojaat qiling.
                </Typography.Paragraph>
              </>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Parolni o'zgartirish" style={{ height: '100%' }}>
            <Form form={form} layout="vertical" requiredMark={false} onFinish={(values) => passwordMutation.mutate(values)}>
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
              <Button type="primary" htmlType="submit" loading={passwordMutation.isPending}>
                Saqlash
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
