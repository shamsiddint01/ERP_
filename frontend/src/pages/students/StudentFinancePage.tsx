import { ArrowLeftOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Popconfirm, Row, Space, Spin, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { revokeStudentDiscount } from '../../api/discounts';
import { getStudent } from '../../api/students';
import { getStudentFinancialSummary } from '../../api/tuition';
import { CreateTuitionChargeModal } from '../../components/CreateTuitionChargeModal';
import { GrantDiscountModal } from '../../components/GrantDiscountModal';
import { useAuthStore } from '../../store/auth.store';
import type { TuitionChargeStatus } from '../../types';

const STATUS_COLORS: Record<TuitionChargeStatus, string> = {
  PENDING: 'blue',
  PARTIALLY_PAID: 'orange',
  PAID: 'green',
  OVERDUE: 'red',
  CANCELLED: 'default',
};

export function StudentFinancePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [chargeModalOpen, setChargeModalOpen] = useState(false);
  const [grantModalOpen, setGrantModalOpen] = useState(false);

  const studentQuery = useQuery({ queryKey: ['student', id], queryFn: () => getStudent(id!), enabled: !!id });
  const summaryQuery = useQuery({ queryKey: ['student-financial-summary', id], queryFn: () => getStudentFinancialSummary(id!), enabled: !!id });

  const revokeMutation = useMutation({
    mutationFn: (studentDiscountId: string) => revokeStudentDiscount(id!, studentDiscountId),
    onSuccess: () => {
      message.success('Chegirma bekor qilindi');
      queryClient.invalidateQueries({ queryKey: ['student-financial-summary', id] });
    },
  });

  if (studentQuery.isLoading || summaryQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const student = studentQuery.data;
  const summary = summaryQuery.data;
  if (!student || !summary) return null;

  const canCreateCharge = hasPermission('tuition', 'CREATE');
  const canManageDiscounts = hasPermission('discounts', 'CREATE');
  const canRevokeDiscount = hasPermission('discounts', 'DELETE');

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(`/students/${id}`)} style={{ marginBottom: 8 }}>
        O'quvchi profiliga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {student.fullName} — Moliyaviy holat
            </Typography.Title>
            <Typography.Text type="secondary">{student.studentCode}</Typography.Text>
          </Col>
          <Col>
            <Space>
              {canManageDiscounts && (
                <Button icon={<PlusOutlined />} onClick={() => setGrantModalOpen(true)}>
                  Chegirma biriktirish
                </Button>
              )}
              {canCreateCharge && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setChargeModalOpen(true)}>
                  Yangi hisob
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={5}>
          <Card>
            <Statistic title="Jami hisoblangan" value={summary.balance.totalBilled} precision={2} />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic title="Chegirmalar" value={summary.balance.discounts} precision={2} />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic title="To'langan" value={summary.balance.paid} precision={2} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic title="Qoldiq" value={summary.balance.outstanding} precision={2} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="Muddati o'tgan" value={summary.balance.overdue} precision={2} valueStyle={{ color: summary.balance.overdue > 0 ? '#cf1322' : undefined }} />
          </Card>
        </Col>
      </Row>

      <Tabs
        items={[
          {
            key: 'charges',
            label: 'Hisoblar',
            children: (
              <Table
                size="small"
                rowKey="id"
                dataSource={summary.charges}
                pagination={false}
                onRow={(record) => ({ onClick: () => navigate(`/tuition/${record.id}`), style: { cursor: 'pointer' } })}
                columns={[
                  { title: 'Davr', dataIndex: 'billingPeriod' },
                  { title: 'Guruh', render: (_, record) => record.enrollment.group.name },
                  { title: 'Sof summa', dataIndex: 'netAmount', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
                  { title: "To'langan", dataIndex: 'allocatedAmount', render: (v: number) => v.toLocaleString('uz-UZ') },
                  { title: 'Qoldiq', dataIndex: 'outstanding', render: (v: number) => v.toLocaleString('uz-UZ') },
                  { title: 'Muddati', dataIndex: 'dueDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
                  { title: 'Status', dataIndex: 'status', render: (v: TuitionChargeStatus) => <Tag color={STATUS_COLORS[v]}>{v}</Tag> },
                ]}
              />
            ),
          },
          {
            key: 'payments',
            label: "To'lovlar",
            children: (
              <Table
                size="small"
                rowKey="id"
                dataSource={summary.payments}
                pagination={false}
                columns={[
                  { title: 'Raqam', dataIndex: 'paymentNumber' },
                  { title: 'Summa', dataIndex: 'amount', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
                  { title: 'Taqsimlangan', dataIndex: 'allocatedAmount', render: (v: number) => v.toLocaleString('uz-UZ') },
                  { title: 'Taqsimlanmagan', dataIndex: 'unallocatedAmount', render: (v: number) => v.toLocaleString('uz-UZ') },
                  { title: 'Usul', dataIndex: 'method' },
                  { title: 'Sana', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('uz-UZ') },
                ]}
              />
            ),
          },
          {
            key: 'history',
            label: 'Taqsimlash tarixi',
            children: (
              <Table
                size="small"
                rowKey="id"
                dataSource={summary.allocationHistory}
                pagination={false}
                columns={[
                  { title: 'Davr', dataIndex: 'billingPeriod' },
                  { title: "To'lov raqami", dataIndex: ['payment', 'paymentNumber'] },
                  { title: 'Summa', dataIndex: 'amount', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
                  { title: 'Sana', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('uz-UZ') },
                ]}
              />
            ),
          },
          {
            key: 'discounts',
            label: 'Chegirmalar',
            children: (
              <Table
                size="small"
                rowKey="id"
                dataSource={summary.discounts}
                pagination={false}
                columns={[
                  { title: 'Chegirma', dataIndex: ['discount', 'name'] },
                  {
                    title: 'Qiymati',
                    render: (_, record) => (record.discount.type === 'PERCENTAGE' ? `${Number(record.discount.value)}%` : Number(record.discount.value).toLocaleString('uz-UZ')),
                  },
                  { title: 'Qamrovi', render: (_, record) => record.enrollment?.group.name ?? 'Barcha yozilishlar' },
                  { title: 'Boshlanish', dataIndex: 'startDate', render: (v: string) => new Date(v).toLocaleDateString('uz-UZ') },
                  { title: 'Tugash', dataIndex: 'endDate', render: (v: string | null) => (v ? new Date(v).toLocaleDateString('uz-UZ') : 'Doimiy') },
                  {
                    title: 'Amallar',
                    render: (_, record) =>
                      canRevokeDiscount && (
                        <Popconfirm title="Chegirmani bekor qilish?" onConfirm={() => revokeMutation.mutate(record.id)}>
                          <Button size="small" danger icon={<StopOutlined />} />
                        </Popconfirm>
                      ),
                  },
                ]}
              />
            ),
          },
        ]}
      />

      <CreateTuitionChargeModal open={chargeModalOpen} onClose={() => setChargeModalOpen(false)} fixedStudentId={id} />
      <GrantDiscountModal open={grantModalOpen} onClose={() => setGrantModalOpen(false)} studentId={id!} />
    </div>
  );
}
