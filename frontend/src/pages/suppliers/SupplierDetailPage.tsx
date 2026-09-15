import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Card, Col, Descriptions, Form, InputNumber, Modal, Popconfirm, Row, Select, Spin, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSupplier, getSupplierHistory, linkSupplierProduct, unlinkSupplierProduct } from '../../api/suppliers';
import { listProducts } from '../../api/products';
import { useAuthStore } from '../../store/auth.store';

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [form] = Form.useForm();

  const supplierQuery = useQuery({ queryKey: ['supplier', id], queryFn: () => getSupplier(id!), enabled: !!id });
  const historyQuery = useQuery({ queryKey: ['supplier-history', id], queryFn: () => getSupplierHistory(id!), enabled: !!id });
  const productsQuery = useQuery({ queryKey: ['products-all'], queryFn: () => listProducts({ pageSize: 100 }), enabled: linkModalOpen });

  const linkMutation = useMutation({
    mutationFn: (values: { productId: string; unitCost: number; supplierSku?: string }) => linkSupplierProduct(id!, values),
    onSuccess: () => {
      message.success("Mahsulot bog'landi");
      queryClient.invalidateQueries({ queryKey: ['supplier-history', id] });
      setLinkModalOpen(false);
      form.resetFields();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? "Bog'lab bo'lmadi");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (productId: string) => unlinkSupplierProduct(id!, productId),
    onSuccess: () => {
      message.success("Bog'lanish o'chirildi");
      queryClient.invalidateQueries({ queryKey: ['supplier-history', id] });
    },
  });

  if (supplierQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const supplier = supplierQuery.data;
  if (!supplier) return null;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/suppliers')} style={{ marginBottom: 8 }}>
        Yetkazib beruvchilar ro'yxatiga qaytish
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {supplier.companyName}
            </Typography.Title>
            <Typography.Text type="secondary">{supplier.contactPerson}</Typography.Text>
          </Col>
          <Col>
            <Tag color={supplier.status === 'ACTIVE' ? 'green' : 'default'}>{supplier.status === 'ACTIVE' ? 'Faol' : 'Nofaol'}</Tag>
          </Col>
        </Row>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }}>
          <Descriptions.Item label="Telefon">{supplier.phone}</Descriptions.Item>
          <Descriptions.Item label="Email">{supplier.email ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Manzil">{supplier.address ?? '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic title="Qarzdorlik" value={Number(supplier.balance)} suffix="UZS" />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Xarid buyurtmalari" value={supplier._count.purchaseOrders} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Bog'langan mahsulotlar" value={supplier._count.supplierProducts} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs
          items={[
            {
              key: 'purchases',
              label: `Xaridlar (${historyQuery.data?.purchaseOrders.length ?? 0})`,
              children: (
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={historyQuery.data?.purchaseOrders}
                  pagination={false}
                  columns={[
                    { title: 'Raqam', dataIndex: 'poNumber' },
                    { title: 'Status', dataIndex: 'status' },
                    { title: 'Summa', dataIndex: 'grandTotal' },
                    { title: 'Sana', dataIndex: 'orderDate' },
                  ]}
                />
              ),
            },
            {
              key: 'payments',
              label: `To'lovlar (${historyQuery.data?.payments.length ?? 0})`,
              children: historyQuery.data?.payments.length ? (
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={historyQuery.data.payments}
                  pagination={false}
                  columns={[
                    { title: 'Raqam', dataIndex: 'paymentNumber' },
                    { title: 'Summa', dataIndex: 'amount' },
                    { title: 'Usul', dataIndex: 'method' },
                  ]}
                />
              ) : (
                <Alert type="info" showIcon title="Hali to'lovlar yo'q" description="Payments moduli qurilgach bu yerda ko'rinadi." />
              ),
            },
            {
              key: 'products',
              label: `Mahsulotlar (${historyQuery.data?.products.length ?? 0})`,
              children: (
                <div>
                  {hasPermission('suppliers', 'EDIT') && (
                    <Button icon={<PlusOutlined />} size="small" style={{ marginBottom: 12 }} onClick={() => setLinkModalOpen(true)}>
                      Mahsulot bog'lash
                    </Button>
                  )}
                  <Table
                    size="small"
                    rowKey="id"
                    dataSource={historyQuery.data?.products}
                    pagination={false}
                    columns={[
                      { title: 'Mahsulot', dataIndex: ['product', 'name'] },
                      { title: 'SKU', dataIndex: ['product', 'sku'] },
                      { title: 'Yetkazib beruvchi narxi', dataIndex: 'unitCost' },
                      {
                        title: 'Amallar',
                        render: (_, record: { product: { id: string } }) =>
                          hasPermission('suppliers', 'EDIT') && (
                            <Popconfirm title="Bog'lanishni o'chirish?" onConfirm={() => unlinkMutation.mutate(record.product.id)}>
                              <Button size="small" danger>
                                O'chirish
                              </Button>
                            </Popconfirm>
                          ),
                      },
                    ]}
                  />
                </div>
              ),
            },
            {
              key: 'activity',
              label: `Activity (${historyQuery.data?.activity.length ?? 0})`,
              children: (
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={historyQuery.data?.activity}
                  pagination={false}
                  columns={[
                    { title: 'Vaqt', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('uz-UZ') },
                    { title: 'Kim', dataIndex: ['actor', 'fullName'] },
                    { title: 'Amal', dataIndex: 'action' },
                    { title: 'Tavsif', dataIndex: 'description' },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="Mahsulotni bog'lash"
        open={linkModalOpen}
        onCancel={() => setLinkModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={linkMutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => linkMutation.mutate(values)}>
          <Form.Item name="productId" label="Mahsulot" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={productsQuery.data?.items.map((p) => ({ label: `${p.name} (${p.sku})`, value: p.id }))}
            />
          </Form.Item>
          <Form.Item name="unitCost" label="Yetkazib beruvchi narxi" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
