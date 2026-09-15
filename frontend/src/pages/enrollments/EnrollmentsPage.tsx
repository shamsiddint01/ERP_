import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBranches } from '../../api/branches';
import { listCourses } from '../../api/courses';
import { listEnrollments } from '../../api/enrollments';
import { listGroups } from '../../api/groups';
import { listStudents } from '../../api/students';
import { listTeachers } from '../../api/teachers';
import { EnrollmentFormModal } from '../../components/EnrollmentFormModal';
import { PageErrorState } from '../../components/PageErrorState';
import { useAuthStore } from '../../store/auth.store';
import type { EnrollmentListItem, EnrollmentStatus } from '../../types';

const STATUS_COLORS: Record<EnrollmentStatus, string> = { ACTIVE: 'green', PAUSED: 'gold', COMPLETED: 'blue', CANCELLED: 'red', TRANSFERRED: 'purple' };
const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  ACTIVE: 'Faol',
  PAUSED: 'Muzlatilgan',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
  TRANSFERRED: "Ko'chirilgan",
};

export function EnrollmentsPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentId, setStudentId] = useState<string | undefined>();
  const [groupId, setGroupId] = useState<string | undefined>();
  const [courseId, setCourseId] = useState<string | undefined>();
  const [teacherEmployeeId, setTeacherEmployeeId] = useState<string | undefined>();
  const [branchId, setBranchId] = useState<string | undefined>();
  const [status, setStatus] = useState<EnrollmentStatus | undefined>();
  const [dateRange, setDateRange] = useState<[string, string] | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const canStudents = hasPermission('students', 'VIEW');
  const canGroups = hasPermission('groups', 'VIEW');
  const canCourses = hasPermission('courses', 'VIEW');
  const canTeachers = hasPermission('teachers', 'VIEW');
  const canBranches = hasPermission('branches', 'VIEW');
  const studentsQuery = useQuery({
    queryKey: ['students', { search: studentSearch || undefined, pageSize: 20, forEnrollmentFilter: true }],
    queryFn: () => listStudents({ search: studentSearch || undefined, pageSize: 20 }),
    enabled: canStudents,
  });
  const groupsQuery = useQuery({ queryKey: ['groups', { pageSize: 100, forEnrollmentFilter: true }], queryFn: () => listGroups({ pageSize: 100 }), enabled: canGroups });
  const coursesQuery = useQuery({ queryKey: ['courses', { pageSize: 100 }], queryFn: () => listCourses({ pageSize: 100 }), enabled: canCourses });
  const teachersQuery = useQuery({ queryKey: ['teachers', { pageSize: 100 }], queryFn: () => listTeachers({ pageSize: 100 }), enabled: canTeachers });
  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100 }], queryFn: () => listBranches({ pageSize: 100 }), enabled: canBranches });

  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', { studentId, groupId, courseId, teacherEmployeeId, branchId, status, dateRange, page }],
    queryFn: () =>
      listEnrollments({ studentId, groupId, courseId, teacherEmployeeId, branchId, status, dateFrom: dateRange?.[0], dateTo: dateRange?.[1], page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  if (enrollmentsQuery.isError && !enrollmentsQuery.data) {
    return <PageErrorState onRetry={() => enrollmentsQuery.refetch()} />;
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Yozilishlar
        </Typography.Title>
        {hasPermission('enrollments', 'CREATE') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi yozilish
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        {canStudents && (
          <Select
            showSearch
            placeholder="O'quvchi"
            allowClear
            style={{ width: 200 }}
            loading={studentsQuery.isLoading}
            filterOption={false}
            onSearch={setStudentSearch}
            options={studentsQuery.data?.items.map((s) => ({ value: s.id, label: s.fullName }))}
            onChange={(value) => {
              setStudentId(value);
              setPage(1);
            }}
          />
        )}
        {canGroups && (
          <Select
            placeholder="Guruh"
            allowClear
            style={{ width: 180 }}
            options={groupsQuery.data?.items.map((g) => ({ value: g.id, label: g.name }))}
            onChange={(value) => {
              setGroupId(value);
              setPage(1);
            }}
          />
        )}
        {canCourses && (
          <Select
            placeholder="Kurs"
            allowClear
            style={{ width: 170 }}
            options={coursesQuery.data?.items.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(value) => {
              setCourseId(value);
              setPage(1);
            }}
          />
        )}
        {canTeachers && (
          <Select
            placeholder="O'qituvchi"
            allowClear
            style={{ width: 170 }}
            options={teachersQuery.data?.items.map((t) => ({ value: t.employeeId, label: t.employee.fullName }))}
            onChange={(value) => {
              setTeacherEmployeeId(value);
              setPage(1);
            }}
          />
        )}
        {canBranches && (
          <Select
            placeholder="Filial"
            allowClear
            style={{ width: 150 }}
            options={branchesQuery.data?.items.map((b) => ({ value: b.id, label: b.name }))}
            onChange={(value) => {
              setBranchId(value);
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
      </Space>

      <Table<EnrollmentListItem>
        rowKey="id"
        loading={enrollmentsQuery.isLoading}
        dataSource={enrollmentsQuery.data?.items}
        onRow={(record) => ({ onClick: () => navigate(`/enrollments/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: enrollmentsQuery.data?.total, onChange: setPage }}
        columns={[
          { title: "O'quvchi", render: (_, record) => record.student.fullName },
          { title: 'Guruh', render: (_, record) => record.group.name },
          { title: 'Kurs', render: (_, record) => record.group.course.name },
          { title: "O'qituvchi", render: (_, record) => record.group.teacherEmployee?.fullName ?? '—' },
          { title: 'Filial', render: (_, record) => record.group.branch.name },
          { title: 'Boshlanish', dataIndex: 'startDate', render: (v: string) => dayjs(v).format('DD.MM.YYYY') },
          { title: "Kelishilgan to'lov", dataIndex: 'agreedTuition', render: (v: string | null) => (v ? Number(v).toLocaleString('uz-UZ') : '—') },
          { title: 'Chegirma', dataIndex: 'discountAmount', render: (v: string | null) => (v ? Number(v).toLocaleString('uz-UZ') : '—') },
          { title: 'Status', dataIndex: 'status', render: (v: EnrollmentStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
        ]}
      />

      <EnrollmentFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
