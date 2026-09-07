import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, InputNumber, Modal, Select, Space } from 'antd';
import { createTransfer } from '../api/inventory';
import { listProducts } from '../api/products';
import { listWarehouses } from '../api/warehouses';

interface CreateTransferModalProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  fromWarehouseId: string;
  toWarehouseId: string;
  items: Array<{ productId: string; quantity: number }>;
}

export function CreateTransferModal({ open, onClose }: CreateTransferModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: listWarehouses, enabled: open });
  const productsQuery = useQuery({ queryKey: ['products-all'], queryFn: () => listProducts({ pageSize: 100 }), enabled: open });

  const mutation = useMutation({
    mutationFn: createTransfer,
    onSuccess: () => {
      message.success('Transfer yaratildi (DRAFT)');
      queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Transfer yaratib bo‘lmadi');
    },
  });

  return (
    <Modal
      title="Omborlar orasida transfer"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={600}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Space style={{ display: 'flex' }}>
          <Form.Item name="fromWarehouseId" label="Qayerdan" rules={[{ required: true }]} style={{ width: '100%' }}>
            <Select options={warehousesQuery.data?.map((w) => ({ label: w.name, value: w.id }))} />
          </Form.Item>
          <Form.Item name="toWarehouseId" label="Qayerga" rules={[{ required: true }]} style={{ width: '100%' }}>
            <Select options={warehousesQuery.data?.map((w) => ({ label: w.name, value: w.id }))} />
          </Form.Item>
        </Space>

        <Form.List name="items" initialValue={[{ productId: undefined, quantity: undefined }]}>
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name, ...restField }) => (
                <Space key={key} style={{ display: 'flex' }} align="baseline">
                  <Form.Item
                    {...restField}
                    name={[name, 'productId']}
                    rules={[{ required: true, message: 'Mahsulot tanlang' }]}
                    style={{ width: 320 }}
                  >
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
                  {fields.length > 1 && <MinusCircleOutlined onClick={() => remove(name)} />}
                </Space>
              ))}
              <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                Mahsulot qo'shish
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
