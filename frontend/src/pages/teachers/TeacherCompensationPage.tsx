import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Descriptions, Row, Spin, Statistic, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { getTeacher, getTeacherCompensationPreview } from '../../api/teachers';
import type { SalaryType } from '../../types';

const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  HOURLY: 'Soatbay',
  DAILY: 'Kunlik',
  MONTHLY: 'Oylik (fiksed)',
  PER_LESSON: 'Dars uchun',
  PER_GROUP: 'Guruh uchun',
  MIXED: 'Aralash',
};

export function TeacherCompensationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const teacherQuery = useQuery({ queryKey: ['teacher', id], queryFn: () => getTeacher(id!), enabled: !!id });
  const previewQuery = useQuery({ queryKey: ['teacher-compensation', id], queryFn: () => getTeacherCompensationPreview(id!), enabled: !!id });

  if (teacherQuery.isLoading || previewQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const teacher = teacherQuery.data;
  const preview = previewQuery.data;
  if (!teacher || !preview) return null;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(`/teachers/${id}`)} style={{ marginBottom: 8 }}>
        O'qituvchi profiliga qaytish
      </Button>

      <Typography.Title level={4}>{teacher.employee.fullName} — Maosh</Typography.Title>

      <Card style={{ marginBottom: 24 }}>
        <Descriptions column={2} title="Joriy shartnoma">
          <Descriptions.Item label="Turi">
            {preview.currentCompensation ? SALARY_TYPE_LABELS[preview.currentCompensation.salaryType] : 'Belgilanmagan'}
          </Descriptions.Item>
          <Descriptions.Item label="Bazaviy summa">
            {preview.currentCompensation ? Number(preview.currentCompensation.baseSalary).toLocaleString('uz-UZ') : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Soatlik stavka">{preview.rates.hourlyRate?.toLocaleString('uz-UZ') ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Dars uchun stavka">{preview.rates.perLessonRate?.toLocaleString('uz-UZ') ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Guruh uchun stavka">{preview.rates.perGroupRate?.toLocaleString('uz-UZ') ?? '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message={`Davr: ${new Date(preview.period.start).toLocaleDateString('uz-UZ')} — ${new Date(preview.period.end).toLocaleDateString('uz-UZ')}`}
      />

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Yakunlangan darslar" value={preview.completedLessons} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Faol guruhlar" value={preview.activeGroups} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Darslar bo'yicha (taxminiy)" value={preview.estimatedLessonPay ?? '—'} precision={preview.estimatedLessonPay !== null ? 2 : undefined} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Guruhlar bo'yicha (taxminiy)" value={preview.estimatedGroupPay ?? '—'} precision={preview.estimatedGroupPay !== null ? 2 : undefined} />
          </Card>
        </Col>
      </Row>

      <Button onClick={() => navigate('/payroll')}>Ish haqi (Payroll) bo'limiga o'tish</Button>
    </div>
  );
}
