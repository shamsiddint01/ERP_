import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCurrentUser, login } from '../api/auth';
import { BrandMark } from '../components/BrandMark';
import { useBranding } from '../hooks/useBranding';
import { elevation } from '../theme';
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
  const { data: branding } = useBranding();

  async function handleSubmit(values: LoginFormValues) {
    setError(null);
    setLoading(true);
    try {
      const { accessToken, user } = await login(values.username, values.password);
      setAuth(accessToken, { ...user, phone: null, status: 'ACTIVE', lastActiveAt: null, permissions: [], studentId: null, teacherProfileId: null });
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
    <div className="login-backdrop">
      <Card className="login-card" style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1, boxShadow: elevation.level4 }} styles={{ body: { padding: 32 } }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <BrandMark size={56} logoUrl={branding?.logoUrl} />
        </div>
        <div className="eyebrow" style={{ textAlign: 'center', marginBottom: 6 }}>
          {branding?.companyName ?? "Ta'lim markazi"}
        </div>
        <Typography.Title level={3} style={{ textAlign: 'center', marginTop: 0, marginBottom: 24 }}>
          Tizimga kirish
        </Typography.Title>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={handleSubmit} disabled={loading} requiredMark={false}>
          <Form.Item name="username" label="Login" rules={[{ required: true, message: 'Login kiriting' }]}>
            <Input size="large" prefix={<UserOutlined />} autoFocus />
          </Form.Item>
          <Form.Item name="password" label="Parol" rules={[{ required: true, message: 'Parol kiriting' }]}>
            <Input.Password size="large" prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" size="large" htmlType="submit" block loading={loading}>
              Kirish
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
