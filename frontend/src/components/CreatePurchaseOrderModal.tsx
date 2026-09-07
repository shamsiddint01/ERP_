import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space } from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { createPurchaseOrder } from '../api/purchases';
import { listProducts } from '../api/products';
import { listSuppliers } from '../api/suppliers';
import { listWarehouses } from '../api/warehouses';

interface CreatePurchaseOrderModalProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  supplierId: string;
  warehouseId: string;
  orderDate: dayjs.Dayjs;
  notes?: string;
  items: Array<{ productId: string; quantity: number; unitPrice: number; taxPercent?: number }>;
}

export function CreatePurchaseOrderModal({ open, onClose }: CreatePurchaseOrderModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();

  const suppliersQuery = useQuery({ queryKey: ['suppliers-all'], queryFn: () => listSuppliers({ pageSize: 100 }), enabled: open });
  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: listWarehouses, enabled: open });
  const productsQuery = useQuery({ queryKey: ['products-all'], queryFn: () => listProducts({ pageSize: 100 }), enabled: open });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createPurchaseOrder({
        supplierId: values.supplierId,
        warehouseId: values.warehouseId,
        orderDate: values.orderDate.format('YYYY-MM-DD'),
        notes: values.notes,
        items: values.items,
      }),
    onSuccess: (po) => {
      message.success('Xarid buyurtmasi yaratildi (DRAFT)');
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      form.resetFields();
      onClose();
      navigate(`/purchases/${po.id}`);
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Yaratib bo‘lmadi');
    },
  });

  return (
    <Modal
      title="Yangi xarid buyurtmasi"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={720}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)} initialValues={{ orderDate: dayjs() }}>
        <Space style={{ display: 'flex' }}>
          <Form.Item name="supplierId" label="Yetkazib beruvchi" rules={[{ required: true }]} style={{ width: '100%' }}>
            <Select showSearch optionFilterProp="label" options={suppliersQuery.data?.items.map((s) => ({ label: s.companyName, value: s.id }))} />
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
              {fields.map(({ key, name, ...restField }) => (
                <Space key={key} style={{ display: 'flex' }} align="baseline">
                  <Form.Item {...restField} name={[name, 'productId']} rules={[{ required: true, message: 'Mahsulot' }]} style={{ width: 260 }}>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Mahsulot"
                      options={productsQuery.data?.items.map((p) => ({ label: `${p.name} (${p.sku})`, value: p.id }))}
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
                  {fields.length > 1 && <MinusCircleOutlined onClick={() => remove(name)} />}
                </Space>
              ))}
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
