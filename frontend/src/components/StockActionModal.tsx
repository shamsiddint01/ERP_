import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import { adjustStock, damageStock, stockIn, stockOut } from '../api/inventory';
import { listProducts } from '../api/products';
import { listWarehouses } from '../api/warehouses';

type ActionType = 'STOCK_IN' | 'STOCK_OUT' | 'ADJUST' | 'DAMAGE';

const ACTION_LABELS: Record<ActionType, string> = {
  STOCK_IN: 'Kirim (Stock In)',
  STOCK_OUT: 'Chiqim (Stock Out)',
  ADJUST: 'Tuzatish (Adjustment)',
  DAMAGE: 'Shikastlangan / Yo\'qolgan',
};

interface StockActionModalProps {
  open: boolean;
  onClose: () => void;
  defaultProductId?: string;
  defaultWarehouseId?: string;
}

/** One reusable modal for all four stock operations — Stock In/Out, Adjustment, Damage. */
export function StockActionModal({ open, onClose, defaultProductId, defaultWarehouseId }: StockActionModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [actionType, setActionType] = useState<ActionType>('STOCK_IN');

  const productsQuery = useQuery({ queryKey: ['products-all'], queryFn: () => listProducts({ pageSize: 100 }), enabled: open });
  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: listWarehouses, enabled: open });

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ productId: defaultProductId, warehouseId: defaultWarehouseId });
    }
  }, [open, defaultProductId, defaultWarehouseId, form]);

  interface FormValues {
    productId: string;
    warehouseId: string;
    quantity: number;
    unitCost?: number;
    direction?: 'INCREASE' | 'DECREASE';
    note?: string;
  }

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (actionType === 'STOCK_IN') {
        return stockIn({ productId: values.productId, warehouseId: values.warehouseId, quantity: values.quantity, unitCost: values.unitCost, referenceType: 'PURCHASE', note: values.note });
      }
      if (actionType === 'STOCK_OUT') {
        return stockOut({ productId: values.productId, warehouseId: values.warehouseId, quantity: values.quantity, referenceType: 'SALE', note: values.note });
      }
      if (actionType === 'ADJUST') {
        return adjustStock({ productId: values.productId, warehouseId: values.warehouseId, quantity: values.quantity, direction: values.direction ?? 'INCREASE', note: values.note });
      }
      return damageStock({ productId: values.productId, warehouseId: values.warehouseId, quantity: values.quantity, note: values.note ?? '' });
    },
    onSuccess: () => {
      message.success('Harakat muvaffaqiyatli qo\'shildi');
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      form.resetFields();
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'Amalni bajarib bo‘lmadi');
    },
  });

  function handleSubmit(values: FormValues) {
    mutation.mutate(values);
  }

  return (
    <Modal
      title="Ombor harakati"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item label="Harakat turi">
          <Select
            value={actionType}
            onChange={setActionType}
            options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Form.Item name="productId" label="Mahsulot" rules={[{ required: true }]}>
          <Select
            showSearch
            optionFilterProp="label"
            options={productsQuery.data?.items.map((p) => ({ label: `${p.name} (${p.sku})`, value: p.id }))}
          />
        </Form.Item>
        <Form.Item name="warehouseId" label="Ombor" rules={[{ required: true }]}>
          <Select options={warehousesQuery.data?.map((w) => ({ label: w.name, value: w.id }))} />
        </Form.Item>
        <Form.Item name="quantity" label="Miqdor" rules={[{ required: true }]}>
          <InputNumber min={0.001} style={{ width: '100%' }} />
        </Form.Item>
        {actionType === 'STOCK_IN' && (
          <Form.Item name="unitCost" label="Birlik tannarxi">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        )}
        {actionType === 'ADJUST' && (
          <Form.Item name="direction" label="Yo'nalish" rules={[{ required: true }]} initialValue="INCREASE">
            <Select
              options={[
                { label: 'Ko\'paytirish', value: 'INCREASE' },
                { label: 'Kamaytirish', value: 'DECREASE' },
              ]}
            />
          </Form.Item>
        )}
        <Form.Item name="note" label="Izoh" rules={actionType === 'DAMAGE' ? [{ required: true, message: 'Sabab kiritilishi shart' }] : []}>
          <Input.TextArea />
        </Form.Item>
      </Form>
    </Modal>
  );
}
