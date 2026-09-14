import { CalendarOutlined, PlusOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBranches } from '../../api/branches';
import { listGroups } from '../../api/groups';
import { cancelSchedule, listSchedules } from '../../api/schedules';
import { listTeachers } from '../../api/teachers';
import { GenerateLessonsModal } from '../../components/GenerateLessonsModal';
import { ScheduleFormModal } from '../../components/ScheduleFormModal';
import { useAuthStore } from '../../store/auth.store';
import type { ScheduleDayOfWeek, ScheduleDetail, ScheduleStatus } from '../../types';

const DAY_LABELS: Record<ScheduleDayOfWeek, string> = {
  MONDAY: 'Dushanba',
  TUESDAY: 'Seshanba',
  WEDNESDAY: 'Chorshanba',
  THURSDAY: 'Payshanba',
  FRIDAY: 'Juma',
  SATURDAY: 'Shanba',
  SUNDAY: 'Yakshanba',
};
const STATUS_COLORS: Record<ScheduleStatus, string> = { ACTIVE: 'green', PAUSED: 'gold', CANCELLED: 'red' };
const STATUS_LABELS: Record<ScheduleStatus, string> = { ACTIVE: 'Faol', PAUSED: 'Muzlatilgan', CANCELLED: 'Bekor qilingan' };

export function SchedulesPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState<string | undefined>();
  const [branchId, setBranchId] = useState<string | undefined>();
  const [teacherEmployeeId, setTeacherEmployeeId] = useState<string | undefined>();
  const [dayOfWeek, setDayOfWeek] = useState<ScheduleDayOfWeek | undefined>();
  const [status, setStatus] = useState<ScheduleStatus | undefined>();
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleDetail | undefined>();
  const [generateFor, setGenerateFor] = useState<ScheduleDetail | undefined>();

  const canGroups = hasPermission('groups', 'VIEW');
  const canBranches = hasPermission('branches', 'VIEW');
  const canTeachers = hasPermission('teachers', 'VIEW');
  const groupsQuery = useQuery({ queryKey: ['groups', { pageSize: 100, forScheduleFilter: true }], queryFn: () => listGroups({ pageSize: 100 }), enabled: canGroups });
  const branchesQuery = useQuery({ queryKey: ['branches', { pageSize: 100, forScheduleFilter: true }], queryFn: () => listBranches({ pageSize: 100 }), enabled: canBranches });
  const teachersQuery = useQuery({ queryKey: ['teachers', { pageSize: 100, forScheduleFilter: true }], queryFn: () => listTeachers({ pageSize: 100 }), enabled: canTeachers });

  const schedulesQuery = useQuery({
    queryKey: ['schedules', { search, groupId, branchId, teacherEmployeeId, dayOfWeek, status, page }],
    queryFn: () => listSchedules({ search: search || undefined, groupId, branchId, teacherEmployeeId, dayOfWeek, status, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  function openCreate() {
    setEditingSchedule(undefined);
    setFormOpen(true);
  }

  function openEdit(schedule: ScheduleDetail) {
    setEditingSchedule(schedule);
    setFormOpen(true);
  }

  async function handleCancel(schedule: ScheduleDetail) {
    try {
      await cancelSchedule(schedule.id);
      message.success('Dars jadvali bekor qilindi');
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Bekor qilib bo'lmadi");
    }
  }

  const canCreate = hasPermission('schedules', 'CREATE');
  const canEdit = hasPermission('schedules', 'EDIT');
  const canDelete = hasPermission('schedules', 'DELETE');

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Dars jadvallari
        </Typography.Title>
        <Space>
          <Button icon={<CalendarOutlined />} onClick={() => navigate('/schedules/calendar')}>
            Taqvim ko'rinishi
          </Button>
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Yangi jadval
            </Button>
          )}
        </Space>
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Qidirish: guruh, o'qituvchi, izoh"
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
          placeholder="Hafta kuni"
          allowClear
          style={{ width: 150 }}
          options={Object.entries(DAY_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setDayOfWeek(value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 160 }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </Space>

      <Table<ScheduleDetail>
        rowKey="id"
        loading={schedulesQuery.isLoading}
        dataSource={schedulesQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: schedulesQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Guruh', render: (_, record) => record.group.name },
          { title: 'Hafta kuni', dataIndex: 'dayOfWeek', render: (v: ScheduleDayOfWeek) => DAY_LABELS[v] },
          { title: 'Vaqti', render: (_, record) => `${record.startTime}–${record.endTime}` },
          { title: "O'qituvchi", render: (_, record) => record.teacherEmployee?.fullName ?? '—' },
          { title: 'Filial', render: (_, record) => record.branch.name },
          { title: 'Xona', render: (_, record) => record.classroom?.name ?? '—' },
          { title: 'Boshlanish', dataIndex: 'startDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
          { title: 'Status', dataIndex: 'status', render: (v: ScheduleStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
          {
            title: 'Amallar',
            render: (_, record) => (
              <Space>
                {canEdit && record.status === 'ACTIVE' && (
                  <Button size="small" icon={<ThunderboltOutlined />} onClick={() => setGenerateFor(record)}>
                    Darslarni yaratish
                  </Button>
                )}
                {canEdit && (
                  <Button size="small" onClick={() => openEdit(record)}>
                    Tahrirlash
                  </Button>
                )}
                {canDelete && record.status !== 'CANCELLED' && (
                  <Popconfirm title="Dars jadvalini bekor qilishni tasdiqlaysizmi?" onConfirm={() => handleCancel(record)}>
                    <Button size="small" danger>
                      Bekor qilish
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <ScheduleFormModal open={formOpen} onClose={() => setFormOpen(false)} schedule={editingSchedule} />
      {generateFor && <GenerateLessonsModal open={!!generateFor} onClose={() => setGenerateFor(undefined)} schedule={generateFor} />}
    </div>
  );
}
