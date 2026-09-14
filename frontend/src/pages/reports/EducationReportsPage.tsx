import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Row, Select, Space, Statistic, Table, Tabs, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  downloadEducationReportExport,
  getAcademicReport,
  getAdmissionsReport,
  getAttendanceReport,
  getBranchesReport,
  getGroupsReport,
  getStudentsReport,
  getTeachersReport,
  getTuitionReport,
  type EducationReportQuery,
} from '../../api/educationReports';
import { listBranches } from '../../api/branches';
import { listCourses } from '../../api/courses';
import { listGroups } from '../../api/groups';
import { listStudents } from '../../api/students';
import { listTeachers } from '../../api/teachers';
import { useAuthStore } from '../../store/auth.store';
import type { LeadStatus, StudentGroupStatus, StudentStatus } from '../../types';

const { RangePicker } = DatePicker;
const PIE_COLORS = ['#1677ff', '#f5222d', '#faad14', '#52c41a', '#722ed1', '#13c2c2'];

const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'Faol',
  PAUSED: 'Muzlatilgan',
  GRADUATED: 'Bitirgan',
  INACTIVE: 'Nofaol',
  LEFT: "Chiqib ketgan",
};

const GROUP_STATUS_LABELS: Record<StudentGroupStatus, string> = {
  PLANNED: 'Rejalashtirilgan',
  ACTIVE: 'Faol',
  PAUSED: 'Muzlatilgan',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
};

const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Yangi',
  CONTACTED: "Bog'lanildi",
  TRIAL_SCHEDULED: 'Sinov darsi belgilandi',
  TRIAL_COMPLETED: "Sinov darsi o'tdi",
  ENROLLED: "O'quvchiga aylandi",
  LOST: "Yo'qotildi",
};

function money(value: number) {
  return value.toLocaleString('uz-UZ', { minimumFractionDigits: 2 });
}

function pct(value: number) {
  return `${value}%`;
}

export function EducationReportsPage() {
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);

  const canStudents = hasPermission('students', 'VIEW');
  const canGroups = hasPermission('groups', 'VIEW');
  const canAttendance = hasPermission('student_attendance', 'VIEW');
  const canAcademic = hasPermission('grades', 'VIEW');
  const canTuition = hasPermission('tuition', 'VIEW');
  const canTeachers = hasPermission('teachers', 'VIEW');
  const canAdmissions = hasPermission('leads', 'VIEW');
  const canBranches = hasPermission('branches', 'VIEW');
  const canCourses = hasPermission('courses', 'VIEW');

  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [branchId, setBranchId] = useState<string>();
  const [courseId, setCourseId] = useState<string>();
  const [groupId, setGroupId] = useState<string>();
  const [teacherEmployeeId, setTeacherEmployeeId] = useState<string>();
  const [studentId, setStudentId] = useState<string>();
  const [studentSearch, setStudentSearch] = useState('');

  const [studentStatus, setStudentStatus] = useState<StudentStatus>();
  const [groupStatus, setGroupStatus] = useState<StudentGroupStatus>();
  const [leadStatus, setLeadStatus] = useState<LeadStatus>();

  const [studentsPage, setStudentsPage] = useState(1);
  const [groupsPage, setGroupsPage] = useState(1);
  const [academicPage, setAcademicPage] = useState(1);
  const [teachersPage, setTeachersPage] = useState(1);

  const from = range?.[0]?.format('YYYY-MM-DD');
  const to = range?.[1]?.format('YYYY-MM-DD');
  const base: EducationReportQuery = { from, to, branchId, courseId, groupId, teacherEmployeeId, studentId };

  const branchesLookup = useQuery({ queryKey: ['branches-lookup'], queryFn: () => listBranches({ pageSize: 100 }), enabled: canBranches });
  const coursesLookup = useQuery({ queryKey: ['courses-lookup'], queryFn: () => listCourses({ pageSize: 100 }), enabled: canCourses });
  const groupsLookup = useQuery({ queryKey: ['groups-lookup', courseId, branchId], queryFn: () => listGroups({ pageSize: 100, courseId, branchId }), enabled: canGroups });
  const teachersLookup = useQuery({ queryKey: ['teachers-lookup'], queryFn: () => listTeachers({ pageSize: 100 }), enabled: canTeachers });
  const studentsLookup = useQuery({
    queryKey: ['students-lookup', studentSearch],
    queryFn: () => listStudents({ pageSize: 20, search: studentSearch || undefined }),
    enabled: canStudents,
  });

  const studentsQuery = useQuery({
    queryKey: ['education-reports', 'students', base, studentStatus, studentsPage],
    queryFn: () => getStudentsReport({ ...base, status: studentStatus, page: studentsPage, pageSize: 10 }),
    enabled: canStudents,
  });
  const groupsQuery = useQuery({
    queryKey: ['education-reports', 'groups', base, groupStatus, groupsPage],
    queryFn: () => getGroupsReport({ ...base, status: groupStatus, page: groupsPage, pageSize: 10 }),
    enabled: canGroups,
  });
  const attendanceQuery = useQuery({
    queryKey: ['education-reports', 'attendance', base],
    queryFn: () => getAttendanceReport(base),
    enabled: canAttendance,
  });
  const academicQuery = useQuery({
    queryKey: ['education-reports', 'academic', base, academicPage],
    queryFn: () => getAcademicReport({ ...base, page: academicPage, pageSize: 10 }),
    enabled: canAcademic,
  });
  const tuitionQuery = useQuery({
    queryKey: ['education-reports', 'tuition', base],
    queryFn: () => getTuitionReport(base),
    enabled: canTuition,
  });
  const teachersQuery = useQuery({
    queryKey: ['education-reports', 'teachers', base, teachersPage],
    queryFn: () => getTeachersReport({ ...base, page: teachersPage, pageSize: 10 }),
    enabled: canTeachers,
  });
  const admissionsQuery = useQuery({
    queryKey: ['education-reports', 'admissions', base, leadStatus],
    queryFn: () => getAdmissionsReport({ ...base, status: leadStatus }),
    enabled: canAdmissions,
  });
  const branchesQuery = useQuery({
    queryKey: ['education-reports', 'branches', base],
    queryFn: () => getBranchesReport(base),
    enabled: canBranches,
  });

  async function handleExport(reportPath: string, format: 'csv' | 'pdf', filename: string, extra?: Record<string, string>) {
    try {
      await downloadEducationReportExport(reportPath, format, { ...base, ...extra }, filename);
    } catch {
      message.error("Eksport qilib bo'lmadi");
    }
  }

  const filterBar = (
    <Space style={{ marginBottom: 16 }} wrap>
      <RangePicker value={range} onChange={setRange} />
      {canBranches && (
        <Select
          placeholder="Filial"
          allowClear
          style={{ width: 180 }}
          options={branchesLookup.data?.items.map((b) => ({ value: b.id, label: b.name }))}
          onChange={setBranchId}
        />
      )}
      {canCourses && (
        <Select
          placeholder="Kurs"
          allowClear
          style={{ width: 180 }}
          options={coursesLookup.data?.items.map((c) => ({ value: c.id, label: c.name }))}
          onChange={setCourseId}
        />
      )}
      {canGroups && (
        <Select
          placeholder="Guruh"
          allowClear
          style={{ width: 180 }}
          options={groupsLookup.data?.items.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))}
          onChange={setGroupId}
        />
      )}
      {canTeachers && (
        <Select
          placeholder="O'qituvchi"
          allowClear
          style={{ width: 180 }}
          options={teachersLookup.data?.items.map((t) => ({ value: t.employeeId, label: t.employee.fullName }))}
          onChange={setTeacherEmployeeId}
        />
      )}
      {canStudents && (
        <Select
          placeholder="O'quvchi"
          allowClear
          showSearch
          filterOption={false}
          style={{ width: 200 }}
          onSearch={setStudentSearch}
          options={studentsLookup.data?.items.map((s) => ({ value: s.id, label: `${s.fullName} (${s.studentCode})` }))}
          onChange={setStudentId}
        />
      )}
    </Space>
  );

  const tabs = [
    canStudents && {
      key: 'students',
      label: 'O\'quvchilar',
      children: (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Select placeholder="Status" allowClear style={{ width: 160 }} options={Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))} onChange={setStudentStatus} />
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('students', 'csv', 'education-students')}>
              CSV
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('students', 'pdf', 'education-students')}>
              PDF
            </Button>
          </Space>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Jami o'quvchilar" value={studentsQuery.data?.totalStudents ?? 0} loading={studentsQuery.isLoading} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Faol" value={studentsQuery.data?.activeStudents ?? 0} loading={studentsQuery.isLoading} styles={{ content: { color: '#3f8600' } }} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Nofaol" value={studentsQuery.data?.inactiveStudents ?? 0} loading={studentsQuery.isLoading} styles={{ content: { color: '#f5222d' } }} />
              </Card>
            </Col>
          </Row>
          <Card title="Yangi o'quvchilar (davr bo'yicha)" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={studentsQuery.data?.newStudentsByPeriod ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#1677ff" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Typography.Text strong>Filial bo'yicha</Typography.Text>
              <Table
                rowKey="branchId"
                size="small"
                loading={studentsQuery.isLoading}
                dataSource={studentsQuery.data?.byBranch}
                pagination={false}
                columns={[
                  { title: 'Filial', dataIndex: 'branchName' },
                  { title: "Soni", dataIndex: 'count', align: 'right' },
                ]}
              />
            </Col>
            <Col span={12}>
              <Typography.Text strong>Kurs bo'yicha</Typography.Text>
              <Table
                rowKey="courseId"
                size="small"
                loading={studentsQuery.isLoading}
                dataSource={studentsQuery.data?.byCourse}
                pagination={false}
                columns={[
                  { title: 'Kurs', dataIndex: 'courseName' },
                  { title: "O'quvchilar", dataIndex: 'studentCount', align: 'right' },
                ]}
              />
            </Col>
          </Row>
          <Typography.Text strong>Yozilishlar tarixi</Typography.Text>
          <Table
            rowKey="id"
            size="small"
            loading={studentsQuery.isLoading}
            dataSource={studentsQuery.data?.enrollmentHistory.items}
            pagination={{ current: studentsPage, pageSize: 10, total: studentsQuery.data?.enrollmentHistory.total, onChange: setStudentsPage }}
            columns={[
              { title: 'Kod', render: (_, r) => r.student.studentCode },
              { title: "O'quvchi", render: (_, r) => r.student.fullName },
              { title: 'Guruh', render: (_, r) => r.group.name },
              { title: 'Kurs', render: (_, r) => r.group.course.name },
              { title: 'Filial', render: (_, r) => r.group.branch.name },
              { title: 'Status', dataIndex: 'status' },
            ]}
          />
        </>
      ),
    },
    canGroups && {
      key: 'groups',
      label: 'Guruhlar',
      children: (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Select placeholder="Status" allowClear style={{ width: 160 }} options={Object.entries(GROUP_STATUS_LABELS).map(([value, label]) => ({ value, label }))} onChange={setGroupStatus} />
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('groups', 'csv', 'education-groups')}>
              CSV
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('groups', 'pdf', 'education-groups')}>
              PDF
            </Button>
          </Space>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Guruhlar soni" value={groupsQuery.data?.groupCount ?? 0} loading={groupsQuery.isLoading} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="O'quvchilar soni" value={groupsQuery.data?.studentCount ?? 0} loading={groupsQuery.isLoading} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="O'rtacha to'ldirilish" value={groupsQuery.data?.averageUtilization ?? 0} suffix="%" loading={groupsQuery.isLoading} />
              </Card>
            </Col>
          </Row>
          <Card title="Guruhlar to'ldirilishi (%)" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={groupsQuery.data?.capacityUtilization ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="utilizationPercentage" fill="#1677ff" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Table
            rowKey="id"
            size="small"
            loading={groupsQuery.isLoading}
            dataSource={groupsQuery.data?.groups.items}
            pagination={{ current: groupsPage, pageSize: 10, total: groupsQuery.data?.groups.total, onChange: setGroupsPage }}
            columns={[
              { title: 'Kod', dataIndex: 'code' },
              { title: 'Nomi', dataIndex: 'name' },
              { title: 'Kurs', render: (_, r) => r.course.name },
              { title: 'Filial', render: (_, r) => r.branch.name },
              { title: "O'qituvchi", render: (_, r) => r.teacher?.fullName ?? '—' },
              { title: "O'quvchilar", dataIndex: 'enrolledCount', align: 'right' },
              { title: 'Status', dataIndex: 'status' },
            ]}
          />
        </>
      ),
    },
    canAttendance && {
      key: 'attendance',
      label: 'Davomat',
      children: (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('attendance', 'csv', 'education-attendance')}>
              CSV
            </Button>
          </Space>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Davomat %" value={attendanceQuery.data?.overall.attendancePercentage ?? 0} suffix="%" loading={attendanceQuery.isLoading} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Sababsiz qoldirish %" value={attendanceQuery.data?.overall.absenceRate ?? 0} suffix="%" loading={attendanceQuery.isLoading} styles={{ content: { color: '#f5222d' } }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Kechikish %" value={attendanceQuery.data?.overall.lateRate ?? 0} suffix="%" loading={attendanceQuery.isLoading} styles={{ content: { color: '#faad14' } }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Sababli qoldirish %" value={attendanceQuery.data?.overall.excusedRate ?? 0} suffix="%" loading={attendanceQuery.isLoading} />
              </Card>
            </Col>
          </Row>
          <Card title="Umumiy taqsimot" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={
                    attendanceQuery.data
                      ? [
                          { name: 'Keldi', value: attendanceQuery.data.overall.present },
                          { name: 'Kelmadi', value: attendanceQuery.data.overall.absent },
                          { name: 'Kechikdi', value: attendanceQuery.data.overall.late },
                          { name: 'Sababli', value: attendanceQuery.data.overall.excused },
                        ]
                      : []
                  }
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  label
                >
                  {PIE_COLORS.map((color) => (
                    <Cell key={color} fill={color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Typography.Text strong>Talabalar bo'yicha</Typography.Text>
          <Table
            rowKey={(r) => r.student.id}
            size="small"
            loading={attendanceQuery.isLoading}
            dataSource={attendanceQuery.data?.byStudent}
            pagination={{ pageSize: 10 }}
            style={{ marginBottom: 16 }}
            columns={[
              { title: "O'quvchi", render: (_, r) => r.student.fullName ?? r.student.id },
              { title: 'Keldi', dataIndex: 'present', align: 'right' },
              { title: 'Kelmadi', dataIndex: 'absent', align: 'right' },
              { title: 'Kechikdi', dataIndex: 'late', align: 'right' },
              { title: 'Davomat %', dataIndex: 'attendancePercentage', align: 'right', render: pct },
            ]}
          />
          <Typography.Text strong>Guruhlar bo'yicha</Typography.Text>
          <Table
            rowKey={(r) => r.group.id}
            size="small"
            loading={attendanceQuery.isLoading}
            dataSource={attendanceQuery.data?.byGroup}
            pagination={{ pageSize: 10 }}
            style={{ marginBottom: 16 }}
            columns={[
              { title: 'Guruh', render: (_, r) => r.group.name ?? r.group.id },
              { title: 'Jami', dataIndex: 'total', align: 'right' },
              { title: 'Davomat %', dataIndex: 'attendancePercentage', align: 'right', render: pct },
            ]}
          />
          <Typography.Text strong>O'qituvchilar bo'yicha</Typography.Text>
          <Table
            rowKey={(r) => r.teacher.id}
            size="small"
            loading={attendanceQuery.isLoading}
            dataSource={attendanceQuery.data?.byTeacher}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: "O'qituvchi", render: (_, r) => r.teacher.fullName ?? r.teacher.id },
              { title: 'Jami', dataIndex: 'total', align: 'right' },
              { title: 'Davomat %', dataIndex: 'attendancePercentage', align: 'right', render: pct },
            ]}
          />
        </>
      ),
    },
    canAcademic && {
      key: 'academic',
      label: 'Akademik',
      children: (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('academic', 'csv', 'education-academic')}>
              CSV
            </Button>
          </Space>
          {academicQuery.data?.scope === 'student' ? (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Card size="small">
                    <Statistic title="Imtihonlar" value={academicQuery.data.studentProgress.totalExams} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small">
                    <Statistic title="O'rtacha %" value={academicQuery.data.studentProgress.averagePercentage} suffix="%" />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small">
                    <Statistic title="O'tish darajasi" value={academicQuery.data.studentProgress.passRate} suffix="%" />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small">
                    <Statistic title="Davomat %" value={academicQuery.data.studentProgress.attendancePercentage} suffix="%" />
                  </Card>
                </Col>
              </Row>
              <Space style={{ marginBottom: 12 }}>
                <Link to={`/students/${studentId}?tab=progress`}>To'liq progress sahifasini ochish →</Link>
              </Space>
              <Table
                rowKey="id"
                size="small"
                dataSource={academicQuery.data.studentProgress.recentExams}
                pagination={false}
                columns={[
                  { title: 'Imtihon', dataIndex: 'examTitle' },
                  { title: 'Sana', dataIndex: 'examDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
                  { title: 'Ball', render: (_, r) => `${r.score}/${r.maxScore}` },
                  { title: 'Foiz', dataIndex: 'percentage', render: pct },
                ]}
              />
            </>
          ) : (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={12}>
                  <Card size="small">
                    <Statistic title="O'rtacha ball %" value={academicQuery.data?.averageScore ?? 0} suffix="%" loading={academicQuery.isLoading} />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card size="small">
                    <Statistic title="O'tish darajasi" value={academicQuery.data?.passRate ?? 0} suffix="%" loading={academicQuery.isLoading} />
                  </Card>
                </Col>
              </Row>
              <Card title="Kurslar bo'yicha o'rtacha ball" style={{ marginBottom: 16 }}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={academicQuery.data?.coursePerformance ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="courseName" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="average" fill="#722ed1" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Table
                rowKey="examId"
                size="small"
                loading={academicQuery.isLoading}
                dataSource={academicQuery.data?.examResults.items}
                pagination={{ current: academicPage, pageSize: 10, total: academicQuery.data?.examResults.total, onChange: setAcademicPage }}
                columns={[
                  { title: 'Imtihon', dataIndex: 'title' },
                  { title: 'Kurs', render: (_, r) => r.course.name },
                  { title: 'Guruh', render: (_, r) => r.group.name },
                  { title: 'Sana', dataIndex: 'date', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
                  { title: 'Baholanganlar', dataIndex: 'assessedCount', align: 'right' },
                  { title: "O'rtacha %", dataIndex: 'average', align: 'right', render: pct },
                  { title: "O'tish %", dataIndex: 'passRate', align: 'right', render: pct },
                ]}
              />
            </>
          )}
        </>
      ),
    },
    canTuition && {
      key: 'tuition',
      label: "O'quv to'lovlari",
      children: (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('tuition', 'csv', 'education-tuition')}>
              CSV
            </Button>
          </Space>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Hisoblangan" value={tuitionQuery.data?.billed.totalBilled ?? 0} formatter={(v) => money(Number(v))} loading={tuitionQuery.isLoading} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Yig'ilgan" value={tuitionQuery.data?.collected.totalCollected ?? 0} formatter={(v) => money(Number(v))} loading={tuitionQuery.isLoading} styles={{ content: { color: '#3f8600' } }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Qoldiq" value={tuitionQuery.data?.outstanding.totalOutstanding ?? 0} formatter={(v) => money(Number(v))} loading={tuitionQuery.isLoading} styles={{ content: { color: '#f5222d' } }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Yig'ish darajasi" value={tuitionQuery.data?.collectionRate.collectionRate ?? 0} suffix="%" loading={tuitionQuery.isLoading} />
              </Card>
            </Col>
          </Row>
          <Card title="Davr bo'yicha hisoblangan summa" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tuitionQuery.data?.billed.rows ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="billingPeriod" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Bar dataKey="netAmount" fill="#1677ff" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Typography.Text strong>To'lov usullari bo'yicha</Typography.Text>
          <Table
            rowKey="method"
            size="small"
            loading={tuitionQuery.isLoading}
            dataSource={Object.entries(tuitionQuery.data?.paymentMethodBreakdown ?? {}).map(([method, v]) => ({ method, ...v }))}
            pagination={false}
            columns={[
              { title: 'Usul', dataIndex: 'method' },
              { title: 'Soni', dataIndex: 'count', align: 'right' },
              { title: 'Summa', dataIndex: 'amount', align: 'right', render: money },
            ]}
          />
        </>
      ),
    },
    canTeachers && {
      key: 'teachers',
      label: "O'qituvchilar",
      children: (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('teachers', 'csv', 'education-teachers')}>
              CSV
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('teachers', 'pdf', 'education-teachers')}>
              PDF
            </Button>
          </Space>
          <Card title="Dars soatlari" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={teachersQuery.data?.items ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="hours" fill="#13c2c2" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Table
            rowKey="teacherProfileId"
            size="small"
            loading={teachersQuery.isLoading}
            dataSource={teachersQuery.data?.items}
            pagination={{ current: teachersPage, pageSize: 10, total: teachersQuery.data?.total, onChange: setTeachersPage }}
            columns={[
              { title: 'Kod', dataIndex: 'employeeCode' },
              { title: "O'qituvchi", dataIndex: 'name' },
              { title: 'Guruhlar', dataIndex: 'groups', align: 'right' },
              { title: "O'quvchilar", dataIndex: 'students', align: 'right' },
              { title: 'Darslar', dataIndex: 'lessonCount', align: 'right' },
              { title: 'Soatlar', dataIndex: 'hours', align: 'right' },
              { title: 'Davomat %', render: (_, r) => pct(r.attendance.percentage) },
            ]}
          />
        </>
      ),
    },
    canAdmissions && {
      key: 'admissions',
      label: 'Lidlar',
      children: (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Select placeholder="Status" allowClear style={{ width: 200 }} options={Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label }))} onChange={setLeadStatus} />
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('admissions', 'csv', 'education-admissions')}>
              CSV
            </Button>
          </Space>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Jami lidlar" value={admissionsQuery.data?.leads ?? 0} loading={admissionsQuery.isLoading} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Konversiya %" value={admissionsQuery.data?.conversionRate ?? 0} suffix="%" loading={admissionsQuery.isLoading} styles={{ content: { color: '#3f8600' } }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Muddati o'tgan follow-up" value={admissionsQuery.data?.followUpStatus.overdue ?? 0} loading={admissionsQuery.isLoading} styles={{ content: { color: '#f5222d' } }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Rejalashtirilmagan" value={admissionsQuery.data?.followUpStatus.notScheduled ?? 0} loading={admissionsQuery.isLoading} />
              </Card>
            </Col>
          </Row>
          <Card title="Manba bo'yicha" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={admissionsQuery.data?.leadSource ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="source" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#faad14" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      ),
    },
    canBranches && {
      key: 'branches',
      label: 'Filiallar',
      children: (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('branches', 'csv', 'education-branches')}>
              CSV
            </Button>
          </Space>
          <Card title="Filial bo'yicha o'quvchilar" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={branchesQuery.data?.items ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="branchName" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="students" fill="#1677ff" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Table
            rowKey="branchId"
            size="small"
            loading={branchesQuery.isLoading}
            dataSource={branchesQuery.data?.items}
            pagination={false}
            columns={[
              { title: 'Filial', dataIndex: 'branchName' },
              { title: "O'quvchilar", dataIndex: 'students', align: 'right' },
              { title: 'Guruhlar', dataIndex: 'groups', align: 'right' },
              { title: "O'qituvchilar", dataIndex: 'teachers', align: 'right' },
              { title: 'Hisoblangan', render: (_, r) => money(r.tuition.billed), align: 'right' },
              { title: "Yig'ilgan", render: (_, r) => money(r.tuition.collected), align: 'right' },
              { title: 'Davomat %', render: (_, r) => pct(r.attendance.percentage) },
            ]}
          />
        </>
      ),
    },
  ].filter((tab): tab is Exclude<typeof tab, false> => Boolean(tab));

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Ta'lim markazi hisobotlari
        </Typography.Title>
      </Space>
      {filterBar}
      {tabs.length > 0 ? (
        <Tabs items={tabs} />
      ) : (
        <Card>
          <Typography.Text type="secondary">Hisobotlarni ko'rish uchun ruxsatingiz yo'q.</Typography.Text>
        </Card>
      )}
    </div>
  );
}
