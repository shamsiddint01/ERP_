import { Avatar, Card, Col, Descriptions, Row, Typography } from 'antd';
import { PageHeader } from '../../components/PageHeader';
import { useAuthStore } from '../../store/auth.store';
import { avatarColor } from '../../utils/avatarColor';

export function TeacherSettingsPage() {
  const user = useAuthStore((state) => state.user);
  if (!user) return null;

  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader title="Sozlamalar" />
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={12}>
          <Card title="Profil" style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <Avatar size={56} style={{ background: avatarColor(user.fullName), fontSize: 22, fontWeight: 700 }}>
                {user.fullName.charAt(0)}
              </Avatar>
              <div>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {user.fullName}
                </Typography.Title>
                <Typography.Text type="secondary">Login: {user.username}</Typography.Text>
              </div>
            </div>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Lavozim">Ustoz</Descriptions.Item>
              <Descriptions.Item label="Telefon">{user.phone ?? '—'}</Descriptions.Item>
              {/* Logins issued without an email get a placeholder "<login>@accounts.local" — not worth showing. */}
              <Descriptions.Item label="Email">{user.email && !user.email.endsWith('@accounts.local') ? user.email : '—'}</Descriptions.Item>
            </Descriptions>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
              Ma'lumotlarni o'zgartirish uchun markaz ma'muriyatiga murojaat qiling.
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
