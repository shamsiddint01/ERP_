import { CalendarOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Progress, Row, Skeleton, Table, Tag, Typography } from 'antd';
import { getPortalExams } from '../../api/portal';
import { EmptyState } from '../../components/EmptyState';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { palette } from '../../theme';
import { formatDate, formatNumber } from '../../utils/format';
import { EXAM_TYPE_LABELS, daysUntil, longDate } from './portalLabels';

export function PortalExamsPage() {
  const examsQuery = useQuery({ queryKey: ['portal', 'exams'], queryFn: getPortalExams });

  if (examsQuery.isError) return <PageErrorState onRetry={() => examsQuery.refetch()} />;
  if (examsQuery.isLoading || !examsQuery.data) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  const { upcoming, results } = examsQuery.data;

  return (
    <div>
      <PageHeader title="Imtihon" subtitle="Rejalashtirilgan imtihonlar va natijalaringiz" />

      <div className="eyebrow" style={{ marginBottom: 12 }}>
        Yaqinlashayotgan
      </div>
      {upcoming.length === 0 ? (
        <Card style={{ marginBottom: 24 }}>
          <EmptyState title="Rejalashtirilgan imtihon yo'q" />
        </Card>
      ) : (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {upcoming.map((exam) => {
            const days = daysUntil(exam.date);
            return (
              <Col xs={24} md={12} xl={8} key={exam.id}>
                <Card style={{ height: '100%' }} styles={{ body: { padding: 20 } }}>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 14,
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: days <= 2 ? palette.accentGradient : palette.surfaceRaised,
                        color: days <= 2 ? '#17181C' : palette.text,
                        border: days <= 2 ? 'none' : `1px solid ${palette.border}`,
                      }}
                    >
                      <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{days <= 0 ? '!' : days}</span>
                      <span style={{ fontSize: 10, fontWeight: 700 }}>{days <= 0 ? 'BUGUN' : 'KUN'}</span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Tag color="orange">{EXAM_TYPE_LABELS[exam.type]}</Tag>
                      <Typography.Title level={5} style={{ margin: '6px 0 2px' }} ellipsis>
                        {exam.title}
                      </Typography.Title>
                      <div style={{ fontSize: 12, color: palette.textSecondary }}>
                        <CalendarOutlined /> {longDate(exam.date)} · {exam.group.name}
                      </div>
                      <div style={{ fontSize: 12, color: palette.textMuted, marginTop: 4 }}>
                        O'tish bali: {formatNumber(exam.passingScore)} / {formatNumber(exam.maxScore)}
                      </div>
                    </div>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Card title="Natijalarim" styles={{ body: { paddingTop: 8 } }}>
        <Table
          rowKey="id"
          dataSource={results}
          pagination={results.length > 10 ? { pageSize: 10 } : false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: "Hali natija yo'q" }}
          columns={[
            {
              title: 'Imtihon',
              render: (_, r) => (
                <div>
                  <div style={{ fontWeight: 600 }}>{r.examTitle}</div>
                  <div style={{ fontSize: 12, color: palette.textMuted }}>
                    {EXAM_TYPE_LABELS[r.examType]} · {r.group.name}
                  </div>
                </div>
              ),
            },
            { title: 'Sana', render: (_, r) => formatDate(r.examDate) },
            {
              title: 'Ball',
              render: (_, r) => (
                <span style={{ fontWeight: 700 }}>
                  {formatNumber(r.score, 1)} / {formatNumber(r.maxScore)}
                </span>
              ),
            },
            {
              title: 'Natija',
              width: 180,
              render: (_, r) => (
                <Progress percent={Math.round(r.percentage)} size="small" strokeColor={r.passed ? palette.success : palette.error} format={(p) => `${p}%`} />
              ),
            },
            { title: 'Baho', render: (_, r) => <span style={{ fontWeight: 800, fontSize: 16 }}>{r.grade ?? '—'}</span> },
            { title: 'Holat', render: (_, r) => (r.passed ? <Tag color="green">O'tdi</Tag> : <Tag color="red">O'tmadi</Tag>) },
          ]}
          expandable={{
            rowExpandable: (r) => !!r.comment,
            expandedRowRender: (r) => <Typography.Text type="secondary">O'qituvchi izohi: {r.comment}</Typography.Text>,
          }}
        />
      </Card>
    </div>
  );
}
