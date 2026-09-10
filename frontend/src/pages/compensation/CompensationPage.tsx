import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { deleteCompensation, listCompensation } from '../../api/compensation';
import { listEmployees } from '../../api/employees';
import { CreateCompensationModal } from '../../components/CreateCompensationModal';
import { useAuthStore } from '../../store/auth.store';
import type { EmployeeCompensation, SalaryType } from '../../types';

const SALARY_TYPE_LABELS: Record<SalaryType, string> = { MONTHLY: 'Oylik', DAILY: 'Kunlik', HOURLY: 'Soatlik' };

export function CompensationPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const employeesQuery = useQuery({ queryKey: ['employees', { pageSize: 100 }], queryFn: () => listEmployees({ pageSize: 100 }) });
  const compensationQuery = useQuery({
    queryKey: ['compensation', { employeeId, page }],
    queryFn: () => listCompensation({ employeeId, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCompensation,
    onSuccess: () => {
      message.success('O‘chirildi');
      queryClient.invalidateQueries({ queryKey: ['compensation'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'O‘chirib bo‘lmadi');
    },
  });

  const canCreate = hasPermission('compensation', 'CREATE');
  const canDelete = hasPermission('compensation', 'DELETE');

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Xodimlar maoshi
        </Typography.Title>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Yangi yozuv
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="Xodim bo'yicha filtrlash"
          allowClear
          style={{ width: 260 }}
          showSearch
          options={employeesQuery.data?.items.map((e) => ({ value: e.id, label: `${e.employeeCode} — ${e.fullName}` }))}
          filterOption={(input, option) => ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
          onChange={(value) => {
            setEmployeeId(value);
            setPage(1);
          }}
        />
      </Space>

      <Table<EmployeeCompensation>
        rowKey="id"
        loading={compensationQuery.isLoading}
        dataSource={compensationQuery.data?.items}
        pagination={{ current: page, pageSize: 20, total: compensationQuery.data?.total, onChange: setPage }}
        columns={[
          { title: 'Xodim', render: (_, record) => `${record.employee.employeeCode} — ${record.employee.fullName}` },
          { title: 'Maosh turi', dataIndex: 'salaryType', render: (v: SalaryType) => SALARY_TYPE_LABELS[v] },
          { title: 'Asosiy maosh', dataIndex: 'baseSalary', align: 'right', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          { title: "Qo'shimcha ish stavkasi", dataIndex: 'overtimeRate', align: 'right', render: (v: string | null) => (v ? Number(v).toLocaleString('uz-UZ') : 'Avtomatik') },
          { title: 'Kuchga kirgan', dataIndex: 'effectiveFrom', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
          {
            title: 'Amal qiladi',
            render: (_, record) =>
              record.effectiveTo ? (
                <Tag>{new Date(record.effectiveTo).toLocaleDateString('uz-UZ')} gacha</Tag>
              ) : (
                <Tag color="green">Joriy</Tag>
              ),
          },
          {
            title: 'Amallar',
            render: (_, record) =>
              canDelete && (
                <Popconfirm title="O'chirish?" onConfirm={() => deleteMutation.mutate(record.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
          },
        ]}
      />

      <CreateCompensationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
