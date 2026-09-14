import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, Progress, Row, Spin, Statistic, Table, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { getStudent, getStudentProgress } from '../../api/students';

export function StudentProgressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const studentQuery = useQuery({ queryKey: ['student', id], queryFn: () => getStudent(id!), enabled: !!id });
  const progressQuery = useQuery({ queryKey: ['student-progress', id], queryFn: () => getStudentProgress(id!), enabled: !!id });

  if (studentQuery.isLoading || progressQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const student = studentQuery.data;
  const progress = progressQuery.data;
  if (!student || !progress) return null;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(`/students/${id}`)} style={{ marginBottom: 8 }}>
        O'quvchi profiliga qaytish
      </Button>

      <Typography.Title level={4}>{student.fullName} — O'zlashtirish</Typography.Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Jami imtihonlar" value={progress.totalExams} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="O'rtacha ball (%)" value={progress.averagePercentage} precision={2} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="O'tish darajasi (%)" value={progress.passRate} precision={2} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Davomat (%)" value={progress.attendancePercentage} precision={2} />
          </Card>
        </Col>
      </Row>

      <Card title="Kurslar bo'yicha o'zlashtirish (joriy yozilishlar)" style={{ marginBottom: 24 }}>
        <Table
          rowKey="enrollmentId"
          dataSource={progress.courseProgress}
          pagination={false}
          locale={{ emptyText: "Faol yozilish yo'q" }}
          columns={[
            { title: 'Kurs', dataIndex: 'courseName' },
            { title: 'Guruh', dataIndex: 'groupName' },
            { title: 'Darslar', render: (_, record) => `${record.completedLessons} / ${record.totalLessons}` },
            { title: 'Jarayon', render: (_, record) => <Progress percent={record.progressPercentage} size="small" /> },
          ]}
        />
      </Card>

      <Card title="Yakunlangan kurslar/guruhlar" style={{ marginBottom: 24 }}>
        <Table
          rowKey="enrollmentId"
          dataSource={progress.completedGroups}
          pagination={false}
          locale={{ emptyText: "Hali yakunlangan kurs yo'q" }}
          columns={[
            { title: 'Kurs', dataIndex: 'courseName' },
            { title: 'Guruh', dataIndex: 'groupName' },
            { title: 'Yakunlangan sana', dataIndex: 'endDate', render: (v: string | null) => (v ? new Date(v).toLocaleDateString('uz-UZ') : '—') },
          ]}
        />
      </Card>

      <Card title="So'nggi imtihonlar">
        <Table
          rowKey="id"
          dataSource={progress.recentExams}
          pagination={false}
          locale={{ emptyText: "Hali baho qo'yilmagan" }}
          onRow={(record) => ({ onClick: () => navigate(`/exams/${record.examId}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Imtihon', dataIndex: 'examTitle' },
            { title: 'Sana', dataIndex: 'examDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
            { title: 'Ball', render: (_, record) => `${record.score} / ${record.maxScore}` },
            { title: 'Baho', dataIndex: 'grade' },
          ]}
        />
      </Card>
    </div>
  );
}
