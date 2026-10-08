import { EyeOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Select, Table, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getGroup } from '../../api/groups';
import { listExams } from '../../api/exams';
import { CreateExamModal } from '../../components/CreateExamModal';
import { FilterBar } from '../../components/FilterBar';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { useAuthStore } from '../../store/auth.store';
import type { Exam, ExamStatus, ExamType } from '../../types';

const STATUS_COLORS: Record<ExamStatus, string> = { SCHEDULED: 'blue', COMPLETED: 'green', CANCELLED: 'default' };
const STATUS_LABELS: Record<ExamStatus, string> = { SCHEDULED: 'Rejalashtirilgan', COMPLETED: 'Yakunlangan', CANCELLED: 'Bekor qilingan' };
const TYPE_LABELS: Record<ExamType, string> = {
  QUIZ: 'Test',
  MIDTERM: 'Oraliq nazorat',
  FINAL: 'Yakuniy nazorat',
  MOCK: 'Sinov imtihoni',
  PLACEMENT: 'Daraja aniqlash',
  OTHER: 'Boshqa',
};

export function ExamsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId') ?? undefined;
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [status, setStatus] = useState<ExamStatus | undefined>();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const examsQuery = useQuery({
    queryKey: ['exams', { status, groupId, page }],
    queryFn: () => listExams({ status, groupId, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });
  // Only needed to pre-fill CreateExamModal's locked course when arriving with a groupId (e.g. from a group's own page).
  const groupQuery = useQuery({ queryKey: ['group', groupId], queryFn: () => getGroup(groupId!), enabled: !!groupId });

  const canCreate = hasPermission('exams', 'CREATE');

  if (examsQuery.isError && !examsQuery.data) {
    return <PageErrorState onRetry={() => examsQuery.refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title={groupId ? `Imtihonlar — ${groupQuery.data?.name ?? ''}` : 'Imtihonlar'}
        extra={
          canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Yangi imtihon
            </Button>
          )
        }
      />

      <FilterBar>
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 200 }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </FilterBar>

      <Table<Exam>
        rowKey="id"
        loading={examsQuery.isLoading}
        dataSource={examsQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: examsQuery.data?.total, onChange: setPage }}
        onRow={(record) => ({ onClick: () => navigate(`/exams/${record.id}`), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Sarlavha', dataIndex: 'title' },
          { title: 'Kurs', responsive: ['md'], render: (_, record) => record.course.name },
          { title: 'Guruh', render: (_, record) => record.group.name },
          { title: 'Turi', responsive: ['md'], dataIndex: 'type', render: (v: ExamType) => TYPE_LABELS[v] },
          { title: 'Sana', dataIndex: 'date', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
          { title: "O'qituvchi", responsive: ['md'], render: (_, record) => record.teacherEmployee?.fullName ?? '—' },
          { title: 'Baholangan', render: (_, record) => record._count.assessments },
          { title: 'Status', dataIndex: 'status', render: (v: ExamStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          {
            title: 'Amallar',
            render: (_, record) => (
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/exams/${record.id}`);
                }}
              />
            ),
          },
        ]}
      />

      <CreateExamModal open={createOpen} onClose={() => setCreateOpen(false)} fixedGroupId={groupId} fixedCourseId={groupQuery.data?.course.id} />
    </div>
  );
}
