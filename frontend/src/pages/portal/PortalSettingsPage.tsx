import { useQuery } from '@tanstack/react-query';
import { Avatar, Card, Col, Descriptions, Row, Skeleton, Typography } from 'antd';
import { getPortalOverview } from '../../api/portal';
import { PageHeader } from '../../components/PageHeader';
import { AppearanceCard, ChangePasswordCard } from '../../components/PersonalSettingsCards';
import { useAuthStore } from '../../store/auth.store';
import { avatarColor } from '../../utils/avatarColor';
import { formatDate } from '../../utils/format';


export function PortalSettingsPage() {
  const user = useAuthStore((state) => state.user);
  const overviewQuery = useQuery({ queryKey: ['portal', 'overview'], queryFn: getPortalOverview });
  const student = overviewQuery.data?.student;


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
          <ChangePasswordCard />
        </Col>
        <Col xs={24} lg={12}>
          <AppearanceCard />
        </Col>
      </Row>
    </div>
  );
}
