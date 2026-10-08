import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { App, Button, Card, Col, Row, Statistic, Table, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { downloadReportExport, getStudentDebtReport, type StudentDebtRow } from '../../api/reports';
import { PageErrorState } from '../../components/PageErrorState';
import { formatCurrency } from '../../utils/format';
import { palette } from '../../theme';

export function StudentBalancesPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const debtQuery = useQuery({ queryKey: ['reports', 'student-debt'], queryFn: getStudentDebtReport });

  async function handleExport() {
    try {
      await downloadReportExport('student-debt', 'csv', {}, 'student-balances');
    } catch {
      message.error("Eksport qilib bo'lmadi");
    }
  }

  if (debtQuery.isError && !debtQuery.data) {
    return <PageErrorState onRetry={() => debtQuery.refetch()} />;
  }

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        O'quvchilar balansi
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Qoldiq qarzi bor o'quvchilar ro'yxati — to'liq to'langan o'quvchilar bu ro'yxatda ko'rinmaydi.
      </Typography.Paragraph>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}>
          <Card size="small">
            <Statistic title="Jami hisoblangan" value={debtQuery.data?.totalBilled ?? 0} formatter={(v) => formatCurrency(Number(v))} loading={debtQuery.isLoading} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card size="small">
            <Statistic
              title="To'langan"
              value={debtQuery.data?.paid ?? 0}
              formatter={(v) => formatCurrency(Number(v))}
              loading={debtQuery.isLoading}
              styles={{ content: { color: palette.success } }}
            />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card size="small">
            <Statistic title="Qoldiq" value={debtQuery.data?.outstanding ?? 0} formatter={(v) => formatCurrency(Number(v))} loading={debtQuery.isLoading} styles={{ content: { color: palette.warning } }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card size="small">
            <Statistic
              title="Muddati o'tgan"
              value={debtQuery.data?.overdue ?? 0}
              formatter={(v) => formatCurrency(Number(v))}
              loading={debtQuery.isLoading}
              styles={{ content: { color: palette.error } }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Button icon={<DownloadOutlined />} style={{ marginBottom: 12 }} onClick={handleExport}>
          CSV
        </Button>
        <Table<StudentDebtRow>
          rowKey="studentId"
          loading={debtQuery.isLoading}
          dataSource={debtQuery.data?.rows}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: "Qarzdor o'quvchilar yo'q" }}
          onRow={(record) => ({ onClick: () => navigate(`/students/${record.studentId}?tab=finance`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Kod', responsive: ['md'], dataIndex: 'studentCode' },
            { title: "F.I.Sh.", dataIndex: 'fullName' },
            { title: 'Jami hisoblangan', responsive: ['md'], dataIndex: 'totalBilled', align: 'right', render: (v: number) => formatCurrency(v) },
            { title: 'Chegirmalar', responsive: ['md'], dataIndex: 'discounts', align: 'right', render: (v: number) => formatCurrency(v) },
            { title: "To'langan", dataIndex: 'paid', align: 'right', render: (v: number) => formatCurrency(v) },
            { title: 'Qoldiq', dataIndex: 'outstanding', align: 'right', render: (v: number) => formatCurrency(v) },
            {
              title: "Muddati o'tgan",
              dataIndex: 'overdue',
              align: 'right',
              render: (v: number) => <span style={{ color: v > 0 ? palette.error : undefined }}>{formatCurrency(v)}</span>,
            },
          ]}
        />
      </Card>
    </div>
  );
}
