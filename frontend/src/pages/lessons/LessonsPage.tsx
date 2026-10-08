import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Input, Select, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBranches } from '../../api/branches';
import { listGroups } from '../../api/groups';
import { listLessons } from '../../api/lessons';
import { listTeachers } from '../../api/teachers';
import { FilterBar } from '../../components/FilterBar';
import { LessonFormModal } from '../../components/LessonFormModal';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { useAuthStore } from '../../store/auth.store';
import type { LessonListItem, LessonStatus } from '../../types';

const STATUS_COLORS: Record<LessonStatus, string> = { SCHEDULED: 'default', IN_PROGRESS: 'blue', COMPLETED: 'green', CANCELLED: 'red' };
const STATUS_LABELS: Record<LessonStatus, string> = {
  SCHEDULED: 'Rejalashtirilgan',
  IN_PROGRESS: 'Jarayonda',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
};

export function LessonsPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState<string | undefined>();
  const [branchId, setBranchId] = useState<string | undefined>();
  const [teacherEmployeeId, setTeacherEmployeeId] = useState<string | undefined>();
  const [status, setStatus] = useState<LessonStatus | undefined>();
  const [dateRange, setDateRange] = useState<[string, string] | undefined>();
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const canGroups = hasPermission('groups', 'VIEW');
  const canBranches = hasPermission('branches', 'VIEW');
  const canTeachers = hasPermission('teachers', 'VIEW');
  const groupsQuery = useQuery({ queryKey: ['groups', { pageSize: 100, forLessonFilter: true }], queryFn: () => listGroups({ pageSize: 100 }), enabled: canGroups });
  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100, forLessonFilter: true }], queryFn: () => listBranches({ pageSize: 100 }), enabled: canBranches });
  const teachersQuery = useQuery({ queryKey: ['teachers', { pageSize: 100, forLessonFilter: true }], queryFn: () => listTeachers({ pageSize: 100 }), enabled: canTeachers });

  const lessonsQuery = useQuery({
    queryKey: ['lessons', { search, groupId, branchId, teacherEmployeeId, status, dateRange, page }],
    queryFn: () =>
      listLessons({
        search: search || undefined,
        groupId,
        branchId,
        teacherEmployeeId,
        status,
        dateFrom: dateRange?.[0],
        dateTo: dateRange?.[1],
        page,
        pageSize: 20,
      }),
    placeholderData: (prev) => prev,
  });

  const canCreate = hasPermission('lessons', 'CREATE');

  if (lessonsQuery.isError && !lessonsQuery.data) {
    return <PageErrorState onRetry={() => lessonsQuery.refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title="Darslar"
        extra={
          canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Yangi dars
            </Button>
          )
        }
      />

      <FilterBar>
        <Input
          placeholder="Qidirish: mavzu, guruh, o'qituvchi"
          prefix={<SearchOutlined />}
          style={{ width: 220 }}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {canGroups && (
          <Select
            placeholder="Guruh"
            allowClear
            showSearch
            style={{ width: 180 }}
            filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
            options={groupsQuery.data?.items.map((g) => ({ value: g.id, label: g.name }))}
            onChange={(value) => {
              setGroupId(value);
              setPage(1);
            }}
          />
        )}
        {canBranches && (
          <Select
            placeholder="Filial"
            allowClear
            style={{ width: 160 }}
            options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))}
            onChange={(value) => {
              setBranchId(value);
              setPage(1);
            }}
          />
        )}
        {canTeachers && (
          <Select
            placeholder="O'qituvchi"
            allowClear
            showSearch
            style={{ width: 180 }}
            filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
            options={teachersQuery.data?.items.map((t) => ({ value: t.employeeId, label: t.employee.fullName }))}
            onChange={(value) => {
              setTeacherEmployeeId(value);
              setPage(1);
            }}
          />
        )}
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 170 }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <DatePicker.RangePicker
          onChange={(range) => {
            setDateRange(range && range[0] && range[1] ? [range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')] : undefined);
            setPage(1);
          }}
        />
      </FilterBar>

      <Table<LessonListItem>
        rowKey="id"
        loading={lessonsQuery.isLoading}
        dataSource={lessonsQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/lessons/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: lessonsQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Guruh', render: (_, record) => record.group.name },
          { title: 'Sana', dataIndex: 'scheduledStart', render: (v: string) => dayjs(v).format('DD.MM.YYYY') },
          { title: 'Vaqti', render: (_, record) => `${dayjs(record.scheduledStart).format('HH:mm')}–${dayjs(record.scheduledEnd).format('HH:mm')}` },
          { title: "O'qituvchi", render: (_, record) => record.teacherEmployee?.fullName ?? '—' },
          { title: 'Xona', responsive: ['md'], render: (_, record) => record.classroom?.name ?? '—' },
          { title: 'Filial', responsive: ['md'], render: (_, record) => record.branch.name },
          { title: 'Mavzu', responsive: ['md'], dataIndex: 'topic', render: (v: string | null) => v ?? '—' },
          { title: 'Status', dataIndex: 'status', render: (v: LessonStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
        ]}
      />

      <LessonFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}
