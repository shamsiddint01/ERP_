import { CheckOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Drawer, Form, Input, InputNumber, Modal, Row, Skeleton, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteSalaryPayment, getSalaryOverview, getTeacherSalary, recordSalaryPayment } from '../../api/salaries';
import { EmptyState } from '../../components/EmptyState';
import { PageErrorState } from '../../components/PageErrorState';
import { SalaryMonthDetail } from '../../components/SalaryMonthDetail';
import { useAuthStore } from '../../store/auth.store';
import { palette } from '../../theme';
import type { SalaryOverviewRow } from '../../types';
import { formatNumber } from '../../utils/format';
import { currentPeriod, periodLabel, som } from '../../utils/salary';

function apiError(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(detail) ? detail.join(', ') : (detail ?? fallback);
}

/**
 * To'lovlar → "Ustozlar maoshi": each teacher's month — what their groups'
 * students paid, the teacher's % of it, what has been paid out and what is
 * still owed. "To'landi" records a payout (up to what is owed).
 */
export function TeacherSalariesPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canPay = hasPermission('salaries', 'CREATE');
  const canDelete = hasPermission('salaries', 'DELETE');
  const canEditTeacher = hasPermission('teachers', 'EDIT');

  const [period, setPeriod] = useState(currentPeriod);
  const [paying, setPaying] = useState<SalaryOverviewRow | null>(null);
  const [viewing, setViewing] = useState<SalaryOverviewRow | null>(null);
  const [form] = Form.useForm<{ amount: number; note?: string }>();

  const overviewQuery = useQuery({ queryKey: ['salary', 'overview', period], queryFn: () => getSalaryOverview(period) });
  const detailQuery = useQuery({
    queryKey: ['salary', 'teacher', viewing?.teacherEmployeeId, period],
    queryFn: () => getTeacherSalary(viewing!.teacherEmployeeId, period),
    enabled: !!viewing,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['salary'] });

  const payMutation = useMutation({
    mutationFn: (values: { amount: number; note?: string }) =>
      recordSalaryPayment({ teacherEmployeeId: paying!.teacherEmployeeId, period, amount: values.amount, note: values.note || undefined }),
    onSuccess: () => {
      message.success("Maosh to'langan deb belgilandi");
      refresh();
      setPaying(null);
    },
    onError: (error) => message.error(apiError(error, "Saqlab bo'lmadi")),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSalaryPayment,
    onSuccess: () => {
      message.success("To'lov o'chirildi");
      refresh();
    },
    onError: (error) => message.error(apiError(error, "O'chirib bo'lmadi")),
  });

  if (overviewQuery.isError) return <PageErrorState onRetry={() => overviewQuery.refetch()} />;
  const totals = overviewQuery.data?.totals;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Typography.Text type="secondary">Maosh = guruh o'quvchilari shu oyda to'lagan summadan ustoz foizi</Typography.Text>
        <DatePicker
          picker="month"
          allowClear={false}
          format="MM.YYYY"
          value={dayjs(`${period}-01`)}
          disabledDate={(d) => d.format('YYYY-MM') > currentPeriod()}
          onChange={(d) => d && setPeriod(d.format('YYYY-MM'))}
        />
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { label: "Yig'ilgan to'lovlar", value: totals?.collected },
          { label: 'Hisoblangan maosh', value: totals?.earned },
          { label: "To'langan", value: totals?.paid },
          { label: 'Qoldiq', value: totals?.remaining, accent: true },
        ].map((f) => (
          <Col xs={12} md={6} key={f.label}>
            <Card size="small" styles={{ body: { padding: 16 } }}>
              <div className="eyebrow">{f.label}</div>
              {overviewQuery.isLoading ? (
                <Skeleton.Input active size="small" style={{ marginTop: 8 }} />
              ) : (
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6, color: f.accent && (f.value ?? 0) > 0 ? palette.ember : palette.text }}>{som(f.value ?? 0)}</div>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      <Table<SalaryOverviewRow>
        rowKey="teacherEmployeeId"
        loading={overviewQuery.isLoading}
        dataSource={overviewQuery.data?.items}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: <EmptyState title="Faol ustoz yo'q" /> }}
        onRow={(record) => ({ onClick: () => setViewing(record), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: 'Ustoz',
            render: (_, r) => (
              <div>
                <div style={{ fontWeight: 600 }}>{r.fullName}</div>
                <div style={{ fontSize: 12, color: palette.textMuted }}>{r.groups.length} ta guruhdan to'lov</div>
              </div>
            ),
          },
          {
            title: 'Foiz',
            align: 'center',
            render: (_, r) =>
              r.percent === null ? (
                <Tag
                  color="gold"
                  style={{ cursor: canEditTeacher ? 'pointer' : undefined }}
                  onClick={(e) => {
                    if (!canEditTeacher) return;
                    e.stopPropagation();
                    navigate(`/teachers/${r.teacherProfileId}`);
                  }}
                >
                  Belgilanmagan
                </Tag>
              ) : (
                `${r.percent}%`
              ),
          },
          { title: "Yig'ilgan", align: 'right', render: (_, r) => formatNumber(r.collected) },
          { title: 'Maosh', align: 'right', render: (_, r) => <strong>{formatNumber(r.earned)}</strong> },
          { title: "To'langan", align: 'right', render: (_, r) => <span style={{ color: r.paid > 0 ? palette.success : undefined }}>{formatNumber(r.paid)}</span> },
          {
            title: 'Qoldiq',
            align: 'right',
            render: (_, r) => (r.earned === 0 ? '—' : r.remaining > 0 ? <strong style={{ color: palette.ember }}>{formatNumber(r.remaining)}</strong> : <Tag color="green">To'langan</Tag>),
          },
          ...(canPay
            ? [
                {
                  title: '',
                  render: (_: unknown, r: SalaryOverviewRow) =>
                    r.remaining > 0 && (
                      <Button
                        size="small"
                        type="primary"
                        icon={<CheckOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaying(r);
                        }}
                      >
                        To'landi
                      </Button>
                    ),
                },
              ]
            : []),
        ]}
      />

      <Modal
        open={!!paying}
        title={paying && `${paying.fullName} — ${periodLabel(period)} maoshi`}
        okText="To'landi deb belgilash"
        cancelText="Bekor"
        confirmLoading={payMutation.isPending}
        onCancel={() => setPaying(null)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        {paying && (
          <Typography.Paragraph type="secondary">
            Hisoblangan: {som(paying.earned)} · To'langan: {som(paying.paid)} · Qoldiq: <strong>{som(paying.remaining)}</strong>
          </Typography.Paragraph>
        )}
        <Form form={form} layout="vertical" initialValues={{ amount: paying?.remaining }} onFinish={(values) => payMutation.mutate(values)}>
          <Form.Item name="amount" label="Summa (so'm)" rules={[{ required: true, message: 'Summani kiriting' }]}>
            <InputNumber<number>
              min={1}
              max={paying?.remaining}
              style={{ width: '100%' }}
              formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
              parser={(v) => Number((v ?? '').replace(/\s/g, ''))}
            />
          </Form.Item>
          <Form.Item name="note" label="Izoh">
            <Input placeholder="Masalan: naqd, karta orqali" maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer open={!!viewing} width={760} title={viewing && `${viewing.fullName} — ${periodLabel(period)}`} onClose={() => setViewing(null)} destroyOnHidden>
        {detailQuery.isLoading || !detailQuery.data ? (
          <Skeleton active paragraph={{ rows: 10 }} />
        ) : (
          <SalaryMonthDetail data={detailQuery.data} onDeletePayment={canDelete ? (id) => deleteMutation.mutate(id) : undefined} deleting={deleteMutation.isPending} />
        )}
      </Drawer>
    </div>
  );
}
