import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Input, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBranches } from '../../api/branches';
import { listCourses } from '../../api/courses';
import { listGroups } from '../../api/groups';
import { listTeachers } from '../../api/teachers';
import { GroupFormModal } from '../../components/GroupFormModal';
import { useAuthStore } from '../../store/auth.store';
import type { GroupListItem, StudentGroupStatus } from '../../types';

const STATUS_COLORS: Record<StudentGroupStatus, string> = { PLANNED: 'default', ACTIVE: 'green', PAUSED: 'gold', COMPLETED: 'blue', CANCELLED: 'red' };
const STATUS_LABELS: Record<StudentGroupStatus, string> = {
  PLANNED: 'Rejalashtirilgan',
  ACTIVE: 'Faol',
  PAUSED: 'Muzlatilgan',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
};

export function GroupsPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState<string | undefined>();
  const [branchId, setBranchId] = useState<string | undefined>();
  const [teacherEmployeeId, setTeacherEmployeeId] = useState<string | undefined>();
  const [status, setStatus] = useState<StudentGroupStatus | undefined>();
  const [startRange, setStartRange] = useState<[string, string] | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const canCourses = hasPermission('courses', 'VIEW');
  const canBranches = hasPermission('branches', 'VIEW');
  const canTeachers = hasPermission('teachers', 'VIEW');
  const coursesQuery = useQuery({ queryKey: ['courses', { pageSize: 100 }], queryFn: () => listCourses({ pageSize: 100 }), enabled: canCourses });
  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100 }], queryFn: () => listBranches({ pageSize: 100 }), enabled: canBranches });
  const teachersQuery = useQuery({ queryKey: ['teachers', { pageSize: 100 }], queryFn: () => listTeachers({ pageSize: 100 }), enabled: canTeachers });

  const groupsQuery = useQuery({
    queryKey: ['groups', { search, courseId, branchId, teacherEmployeeId, status, startRange, page }],
    queryFn: () =>
      listGroups({
        search: search || undefined,
        courseId,
        branchId,
        teacherEmployeeId,
        status,
        startFrom: startRange?.[0],
        startTo: startRange?.[1],
        page,
        pageSize: 20,
      }),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Guruhlar
        </Typography.Title>
        {hasPermission('groups', 'CREATE') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi guruh
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Qidirish: nomi yoki kodi"
          prefix={<SearchOutlined />}
          style={{ width: 220 }}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {canCourses && (
          <Select
            placeholder="Kurs"
            allowClear
            style={{ width: 180 }}
            options={coursesQuery.data?.items.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(value) => {
              setCourseId(value);
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
            style={{ width: 180 }}
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
            setStartRange(range && range[0] && range[1] ? [range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')] : undefined);
            setPage(1);
          }}
        />
      </Space>

      <Table<GroupListItem>
        rowKey="id"
        loading={groupsQuery.isLoading}
        dataSource={groupsQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/groups/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: groupsQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Kod', dataIndex: 'code' },
          { title: 'Nomi', dataIndex: 'name' },
          { title: 'Kurs', render: (_, record) => record.course.name },
          { title: "O'qituvchi", render: (_, record) => record.teacherEmployee?.fullName ?? '—' },
          { title: 'Filial', render: (_, record) => record.branch.name },
          { title: 'Xona', render: (_, record) => record.classroom?.name ?? '—' },
          {
            title: "Yozilgan/Sig'im",
            render: (_, record) => (
              <span>
                {record.enrolledCount}/{record.capacity}{' '}
                <Tag color={record.availableSeats > 0 ? 'green' : 'red'}>{record.availableSeats} bo'sh</Tag>
              </span>
            ),
          },
          { title: 'Boshlanish', dataIndex: 'startDate', render: (v: string) => dayjs(v).format('DD.MM.YYYY') },
          { title: 'Status', dataIndex: 'status', render: (v: StudentGroupStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
        ]}
      />

      <GroupFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
