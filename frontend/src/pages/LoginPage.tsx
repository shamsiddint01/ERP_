import { LockOutlined, ReadOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCurrentUser, login } from '../api/auth';
import { palette } from '../theme';
import { useAuthStore } from '../store/auth.store';

interface LoginFormValues {
  username: string;
  password: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(values: LoginFormValues) {
    setError(null);
    setLoading(true);
    try {
      const { accessToken, user } = await login(values.username, values.password);
      setAuth(accessToken, { ...user, phone: null, status: 'ACTIVE', lastActiveAt: null, permissions: [] });
      const profile = await fetchCurrentUser();
      setAuth(accessToken, profile);
      navigate('/', { replace: true });
    } catch {
      setError('Login yoki parol noto‘g‘ri');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: palette.layoutBg }}>
      <Card style={{ width: 380 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: palette.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            color: '#fff',
            margin: '0 auto 16px',
          }}
        >
          <ReadOutlined />
        </div>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
          Ta'lim Markazi tizimiga kirish
        </Typography.Title>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={handleSubmit} disabled={loading}>
          <Form.Item name="username" label="Login" rules={[{ required: true, message: 'Login kiriting' }]}>
            <Input prefix={<UserOutlined />} autoFocus />
          </Form.Item>
          <Form.Item name="password" label="Parol" rules={[{ required: true, message: 'Parol kiriting' }]}>
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Kirish
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
