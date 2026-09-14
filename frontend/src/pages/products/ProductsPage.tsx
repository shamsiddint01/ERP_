import { AppstoreOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { listCategories } from '../../api/categories';
import { createProduct, deactivateProduct, listProducts, updateProduct, type ProductPayload } from '../../api/products';
import { CategoryManagerDrawer } from '../../components/CategoryManagerDrawer';
import { LegacyModuleNotice } from '../../components/LegacyModuleNotice';
import { StockStatusBadge } from '../../components/StockStatusBadge';
import { useAuthStore } from '../../store/auth.store';
import type { ProductListItem, ProductStatus } from '../../types';

const STATUS_LABELS: Record<ProductStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Faol', color: 'green' },
  DRAFT: { label: 'Qoralama', color: 'default' },
  DISCONTINUED: { label: 'Toʻxtatilgan', color: 'red' },
};

export function ProductsPage() {
  const { message } = App.useApp();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [status, setStatus] = useState<ProductStatus | undefined>();
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductListItem | null>(null);
  const [categoriesDrawerOpen, setCategoriesDrawerOpen] = useState(false);
  const [form] = Form.useForm<ProductPayload>();

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: listCategories });
  const productsQuery = useQuery({
    queryKey: ['products', { search, categoryId, status, lowStockOnly, page, pageSize }],
    queryFn: () => listProducts({ search: search || undefined, categoryId, status, lowStockOnly: lowStockOnly || undefined, page, pageSize }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: ProductPayload) => (editingProduct ? updateProduct(editingProduct.id, values) : createProduct(values)),
    onSuccess: () => {
      message.success(editingProduct ? 'Mahsulot yangilandi' : 'Mahsulot yaratildi');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      closeModal();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Saqlab boʻlmadi');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateProduct,
    onSuccess: () => {
      message.success('Mahsulot toʻxtatildi');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  function openCreateModal() {
    setEditingProduct(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEditModal(product: ProductListItem) {
    setEditingProduct(product);
    form.setFieldsValue({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode ?? undefined,
      categoryId: product.categoryId ?? undefined,
      unit: product.unit,
      status: product.status,
      salePrice: Number(product.salePrice),
      costPrice: Number(product.costPrice),
      minStockLevel: Number(product.minStockLevel),
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingProduct(null);
    form.resetFields();
  }

  const canCreate = hasPermission('products', 'CREATE');
  const canEdit = hasPermission('products', 'EDIT');
  const canDelete = hasPermission('products', 'DELETE');

  return (
    <div>
      <LegacyModuleNotice />
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Mahsulotlar
        </Typography.Title>
        <Space>
          <Button icon={<AppstoreOutlined />} onClick={() => setCategoriesDrawerOpen(true)}>
            Kategoriyalar
          </Button>
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              Mahsulot qo'shish
            </Button>
          )}
        </Space>
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Qidirish: nomi, SKU, shtrix-kod"
          prefix={<SearchOutlined />}
          style={{ width: 280 }}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Kategoriya"
          allowClear
          style={{ width: 180 }}
          options={categoriesQuery.data?.map((c) => ({ label: c.name, value: c.id }))}
          onChange={(value) => {
            setCategoryId(value);
            setPage(1);
          }}
        />
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 160 }}
          options={[
            { label: 'Faol', value: 'ACTIVE' },
            { label: 'Qoralama', value: 'DRAFT' },
            { label: 'Toʻxtatilgan', value: 'DISCONTINUED' },
          ]}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <Space>
          <Switch
            checked={lowStockOnly}
            onChange={(checked) => {
              setLowStockOnly(checked);
              setPage(1);
            }}
          />
          <span>Faqat kam qolganlar</span>
        </Space>
      </Space>

      <Table<ProductListItem>
        rowKey="id"
        loading={productsQuery.isLoading}
        dataSource={productsQuery.data?.items}
        pagination={{
          current: page,
          pageSize,
          total: productsQuery.data?.total,
          showSizeChanger: true,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          },
        }}
        columns={[
          { title: 'Mahsulot', dataIndex: 'name' },
          { title: 'SKU', dataIndex: 'sku' },
          { title: 'Kategoriya', dataIndex: ['category', 'name'], render: (v) => v ?? '—' },
          { title: 'Narx', dataIndex: 'salePrice', render: (v: string) => Number(v).toLocaleString('uz-UZ') },
          { title: 'Zaxira', dataIndex: 'totalStock' },
          { title: 'Min. zaxira', dataIndex: 'minStockLevel' },
          {
            title: 'Zaxira holati',
            dataIndex: 'stockStatus',
            render: (value) => <StockStatusBadge status={value} />,
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (value: ProductStatus) => <Tag color={STATUS_LABELS[value].color}>{STATUS_LABELS[value].label}</Tag>,
          },
          {
            title: 'Amallar',
            render: (_, record) => (
              <Space>
                {canEdit && (
                  <Button size="small" onClick={() => openEditModal(record)}>
                    Tahrirlash
                  </Button>
                )}
                {canDelete && record.status !== 'DISCONTINUED' && (
                  <Button danger size="small" loading={deactivateMutation.isPending} onClick={() => deactivateMutation.mutate(record.id)}>
                    To'xtatish
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editingProduct ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Space.Compact block>
            <Form.Item name="name" label="Nomi" rules={[{ required: true }]} style={{ flex: 2 }}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="sku" label="SKU" rules={[{ required: true }]} style={{ width: 180 }}>
              <Input />
            </Form.Item>
            <Form.Item name="barcode" label="Shtrix-kod" style={{ width: 180 }}>
              <Input />
            </Form.Item>
            <Form.Item name="categoryId" label="Kategoriya" style={{ width: 200 }}>
              <Select options={categoriesQuery.data?.map((c) => ({ label: c.name, value: c.id }))} allowClear />
            </Form.Item>
          </Space>
          <Form.Item name="description" label="Tavsif">
            <Input.TextArea />
          </Form.Item>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="costPrice" label="Tannarx" rules={[{ required: true }]} style={{ width: 150 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="salePrice" label="Sotuv narxi" rules={[{ required: true }]} style={{ width: 150 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="unit" label="Birlik" rules={[{ required: true }]} style={{ width: 120 }}>
              <Input placeholder="dona, kg..." />
            </Form.Item>
            <Form.Item name="minStockLevel" label="Min. zaxira" style={{ width: 130 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          {editingProduct && (
            <Form.Item name="status" label="Status">
              <Select
                options={[
                  { label: 'Faol', value: 'ACTIVE' },
                  { label: 'Qoralama', value: 'DRAFT' },
                  { label: 'Toʻxtatilgan', value: 'DISCONTINUED' },
                ]}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <CategoryManagerDrawer open={categoriesDrawerOpen} onClose={() => setCategoriesDrawerOpen(false)} />
    </div>
  );
}
