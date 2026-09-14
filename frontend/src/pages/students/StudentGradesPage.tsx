import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Spin, Table, Tag, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { getStudent, getStudentGrades } from '../../api/students';
import type { ExamType } from '../../types';

const TYPE_LABELS: Record<ExamType, string> = {
  QUIZ: 'Test',
  MIDTERM: 'Oraliq nazorat',
  FINAL: 'Yakuniy nazorat',
  MOCK: 'Sinov imtihoni',
  PLACEMENT: 'Daraja aniqlash',
  OTHER: 'Boshqa',
};

export function StudentGradesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const studentQuery = useQuery({ queryKey: ['student', id], queryFn: () => getStudent(id!), enabled: !!id });
  const gradesQuery = useQuery({ queryKey: ['student-grades', id], queryFn: () => getStudentGrades(id!), enabled: !!id });

  if (studentQuery.isLoading || gradesQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const student = studentQuery.data;
  const grades = gradesQuery.data;
  if (!student || !grades) return null;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(`/students/${id}`)} style={{ marginBottom: 8 }}>
        O'quvchi profiliga qaytish
      </Button>

      <Typography.Title level={4}>{student.fullName} — Baholar</Typography.Title>

      <Card>
        <Table
          rowKey="id"
          dataSource={grades.items}
          pagination={false}
          locale={{ emptyText: 'Hali baho qo\'yilmagan' }}
          onRow={(record) => ({ onClick: () => navigate(`/exams/${record.examId}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Imtihon', dataIndex: 'examTitle' },
            { title: 'Turi', dataIndex: 'examType', render: (v: ExamType) => TYPE_LABELS[v] },
            { title: 'Kurs', render: (_, record) => record.course.name },
            { title: 'Guruh', render: (_, record) => record.group.name },
            { title: 'Sana', dataIndex: 'examDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
            { title: 'Ball', render: (_, record) => `${record.score} / ${record.maxScore}` },
            { title: 'Foiz', dataIndex: 'percentage', render: (v: number) => `${v}%` },
            { title: 'Baho', dataIndex: 'grade' },
            { title: "Natija", render: (_, record) => <Tag color={record.passed ? 'green' : 'red'}>{record.passed ? "O'tdi" : 'Yiqildi'}</Tag> },
          ]}
        />
      </Card>
    </div>
  );
}
