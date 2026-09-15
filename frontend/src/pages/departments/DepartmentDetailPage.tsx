import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, Descriptions, Row, Spin, Statistic, Table, Tag, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { getDepartment } from '../../api/departments';
import type { EmployeeStatus, PositionStatus } from '../../types';

const EMPLOYEE_STATUS_COLORS: Record<EmployeeStatus, string> = { ACTIVE: 'green', ON_LEAVE: 'gold', SUSPENDED: 'orange', TERMINATED: 'default' };
const POSITION_STATUS_COLORS: Record<PositionStatus, string> = { ACTIVE: 'green', INACTIVE: 'default' };

export function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const departmentQuery = useQuery({ queryKey: ['department', id], queryFn: () => getDepartment(id!), enabled: !!id });

  if (departmentQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const department = departmentQuery.data;
  if (!department) return null;

  const activeEmployees = department.employees.filter((e) => e.status === 'ACTIVE').length;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/departments')} style={{ marginBottom: 8 }}>
        Bo'limlar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {department.name} <Tag>{department.code}</Tag>
        </Typography.Title>
        {department.description && <Typography.Text type="secondary">{department.description}</Typography.Text>}
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }}>
          <Descriptions.Item label="Rahbar">{department.managerEmployee?.fullName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Status">{department.status}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic title="Jami xodimlar" value={department.employees.length} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Faol xodimlar" value={activeEmployees} styles={{ content: { color: '#3f8600' } }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Lavozimlar" value={department.positions.length} />
          </Card>
        </Col>
      </Row>

      <Card title="Lavozimlar" style={{ marginBottom: 24 }}>
        <Table
          rowKey="id"
          dataSource={department.positions}
          pagination={false}
          columns={[
            { title: 'Nomi', dataIndex: 'title' },
            { title: 'Kod', dataIndex: 'code' },
            { title: 'Status', dataIndex: 'status', render: (v: PositionStatus) => <Tag color={POSITION_STATUS_COLORS[v]}>{v}</Tag> },
          ]}
        />
      </Card>

      <Card title="Xodimlar">
        <Table
          rowKey="id"
          dataSource={department.employees}
          pagination={false}
          onRow={(record) => ({ onClick: () => navigate(`/employees/${record.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Kod', dataIndex: 'employeeCode' },
            { title: 'F.I.Sh.', dataIndex: 'fullName' },
            { title: 'Lavozim', render: (_, record) => record.position?.title ?? '—' },
            { title: 'Status', dataIndex: 'status', render: (v: EmployeeStatus) => <Tag color={EMPLOYEE_STATUS_COLORS[v]}>{v}</Tag> },
          ]}
        />
      </Card>
    </div>
  );
}
