import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { listCustomers } from '../api/customers';
import { createOrder } from '../api/orders';
import { listProducts } from '../api/products';
import { listWarehouses } from '../api/warehouses';

interface CreateOrderModalProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  customerId: string;
  warehouseId: string;
  orderDate: dayjs.Dayjs;
  notes?: string;
  items: Array<{ productId: string; quantity: number; unitPrice: number; taxPercent?: number; discountAmount?: number }>;
}

export function CreateOrderModal({ open, onClose }: CreateOrderModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();

  const customersQuery = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => listCustomers({ pageSize: 100, status: 'ACTIVE' }),
    enabled: open,
  });
  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: listWarehouses, enabled: open });
  const productsQuery = useQuery({
    queryKey: ['products-all'],
    queryFn: () => listProducts({ pageSize: 100, status: 'ACTIVE' }),
    enabled: open,
  });

  const stockByProduct = new Map(productsQuery.data?.items.map((p) => [p.id, p.totalStock]) ?? []);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createOrder({
        customerId: values.customerId,
        warehouseId: values.warehouseId,
        orderDate: values.orderDate.format('YYYY-MM-DD'),
        notes: values.notes,
        items: values.items,
      }),
    onSuccess: (order) => {
      message.success('Buyurtma yaratildi (DRAFT)');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      form.resetFields();
      onClose();
      navigate(`/orders/${order.id}`);
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Buyurtma yaratib bo‘lmadi');
    },
  });

  return (
    <Modal
      title="Yangi sotuv / buyurtma"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={760}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)} initialValues={{ orderDate: dayjs() }}>
        <Space style={{ display: 'flex' }}>
          <Form.Item name="customerId" label="Mijoz" rules={[{ required: true }]} style={{ width: '100%' }}>
            <Select
              showSearch
              optionFilterProp="label"
              options={customersQuery.data?.items.map((c) => ({ label: c.companyName ? `${c.name} (${c.companyName})` : c.name, value: c.id }))}
            />
          </Form.Item>
          <Form.Item name="warehouseId" label="Ombor" rules={[{ required: true }]} style={{ width: '100%' }}>
            <Select options={warehousesQuery.data?.map((w) => ({ label: w.name, value: w.id }))} />
          </Form.Item>
          <Form.Item name="orderDate" label="Sana" rules={[{ required: true }]} style={{ width: 200 }}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Space>

        <Form.List name="items" initialValue={[{ productId: undefined, quantity: undefined, unitPrice: undefined, taxPercent: 0 }]}>
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name, ...restField }) => {
                const selectedProductId = form.getFieldValue(['items', name, 'productId']);
                const availableStock = selectedProductId ? stockByProduct.get(selectedProductId) : undefined;
                return (
                  <Space key={key} style={{ display: 'flex' }} align="baseline">
                    <Form.Item {...restField} name={[name, 'productId']} rules={[{ required: true, message: 'Mahsulot' }]} style={{ width: 240 }}>
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="Mahsulot"
                        options={productsQuery.data?.items.map((p) => ({ label: `${p.name} (${p.sku})`, value: p.id }))}
                        onChange={() => form.validateFields()}
                      />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true, message: 'Miqdor' }]}>
                      <InputNumber min={0.001} placeholder="Miqdor" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'unitPrice']} rules={[{ required: true, message: 'Narx' }]}>
                      <InputNumber min={0} placeholder="Narx" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'taxPercent']}>
                      <InputNumber min={0} max={100} placeholder="Soliq %" />
                    </Form.Item>
                    {availableStock !== undefined && (
                      <Typography.Text type="secondary" style={{ width: 110 }}>
                        Zaxira: {availableStock}
                      </Typography.Text>
                    )}
                    {fields.length > 1 && <MinusCircleOutlined onClick={() => remove(name)} />}
                  </Space>
                );
              })}
              <Button type="dashed" onClick={() => add({ taxPercent: 0 })} icon={<PlusOutlined />}>
                Mahsulot qo'shish
              </Button>
            </>
          )}
        </Form.List>

        <Form.Item name="notes" label="Izoh" style={{ marginTop: 16 }}>
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
