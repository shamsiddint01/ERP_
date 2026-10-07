import { DeleteOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Popconfirm, Row, Table, Typography } from 'antd';
import { palette, tint } from '../theme';
import type { TeacherSalaryDetail } from '../types';
import { formatDateTime, formatNumber } from '../utils/format';
import { periodLabel, som } from '../utils/salary';
import { EmptyState } from './EmptyState';

function Figure({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <Card size="small" style={{ height: '100%', background: color ? tint(color, 8) : undefined }} styles={{ body: { padding: 16 } }}>
      <div className="eyebrow">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: palette.text }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: palette.textMuted, marginTop: 2 }}>{hint}</div>}
    </Card>
  );
}

/**
 * One teacher's salary month: the four figures, the per-group breakdown it is
 * computed from, the payouts recorded so far and the last six months. Shared
 * by the teacher's own "Maosh" page and the admin's teacher salary drawer.
 */
export function SalaryMonthDetail({ data, onDeletePayment, deleting }: { data: TeacherSalaryDetail; onDeletePayment?: (id: string) => void; deleting?: boolean }) {
  const maxEarned = Math.max(...data.history.map((h) => h.earned), 1);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {data.percent === null && <Alert type="warning" showIcon message="Maosh foizi hali belgilanmagan" description="Foizni markaz ma'muriyati ustoz ma'lumotlarida belgilaydi." />}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Figure label="Yig'ilgan to'lovlar" value={som(data.collected)} hint="Guruhlaringiz o'quvchilaridan" />
        </Col>
        <Col xs={12} md={6}>
          <Figure label="Hisoblangan maosh" value={som(data.earned)} hint={data.percent === null ? 'Foiz belgilanmagan' : `${data.percent}% ulush`} color={palette.primary} />
        </Col>
        <Col xs={12} md={6}>
          <Figure label="To'langan" value={som(data.paid)} color={palette.success} />
        </Col>
        <Col xs={12} md={6}>
          <Figure label="Qoldiq" value={som(data.remaining)} color={data.remaining > 0 ? palette.ember : undefined} />
        </Col>
      </Row>

      <Card size="small" title="Guruhlar bo'yicha">
        <Table
          rowKey="groupId"
          size="small"
          pagination={false}
          dataSource={data.groups}
          locale={{ emptyText: <EmptyState title="Bu oy guruhlaringizdan to'lov tushmagan" /> }}
          columns={[
            { title: 'Guruh', dataIndex: 'groupName' },
            { title: "Yig'ilgan", align: 'right', render: (_, r) => som(r.collected) },
            { title: 'Ulush', align: 'right', render: (_, r) => (data.percent === null ? '—' : som(Math.round(r.collected * data.percent) / 100)) },
          ]}
        />
      </Card>

      <Card size="small" title="To'lovlar (maosh berilgani)">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={data.payments}
          locale={{ emptyText: <EmptyState title="Bu oy uchun hali maosh berilmagan" /> }}
          columns={[
            { title: 'Sana', render: (_, r) => formatDateTime(r.paidAt) },
            { title: 'Summa', align: 'right', render: (_, r) => <strong>{som(r.amount)}</strong> },
            { title: 'Izoh', render: (_, r) => r.note ?? <span style={{ color: palette.textMuted }}>—</span> },
            { title: 'Kiritdi', render: (_, r) => r.recordedBy.fullName },
            ...(onDeletePayment
              ? [
                  {
                    title: '',
                    width: 48,
                    render: (_: unknown, r: TeacherSalaryDetail['payments'][number]) => (
                      <Popconfirm title="Bu to'lovni o'chirasizmi?" okText="O'chirish" cancelText="Bekor" okButtonProps={{ danger: true, loading: deleting }} onConfirm={() => onDeletePayment(r.id)}>
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="O'chirish" />
                      </Popconfirm>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      <Card size="small" title="Oxirgi 6 oy">
        {data.history.map((month) => (
          <div key={month.period} style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', alignItems: 'center', gap: 12, padding: '6px 0' }}>
            <Typography.Text style={{ fontSize: 13 }}>{periodLabel(month.period)}</Typography.Text>
            <div style={{ height: 8, borderRadius: 4, background: palette.surfaceRaised, overflow: 'hidden' }}>
              <div style={{ width: `${(month.earned / maxEarned) * 100}%`, height: '100%', borderRadius: 4, background: palette.primary }} />
            </div>
            <div style={{ fontSize: 13, textAlign: 'right', minWidth: 150 }}>
              <strong>{som(month.earned)}</strong>
              {month.earned > 0 && (
                <span style={{ color: month.remaining > 0 ? palette.ember : palette.success, marginLeft: 6, fontSize: 12 }}>
                  {month.remaining > 0 ? `${formatNumber(month.remaining)} qoldi` : "to'langan"}
                </span>
              )}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
