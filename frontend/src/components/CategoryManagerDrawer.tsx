import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Form, Input, List, Popconfirm, Space } from 'antd';
import { EmptyState } from './EmptyState';
import { createCategory, deleteCategory, listCategories } from '../api/categories';

interface CategoryManagerDrawerProps {
  open: boolean;
  onClose: () => void;
}

/** Reusable category CRUD surface — opened from the Products page toolbar. */
export function CategoryManagerDrawer({ open, onClose }: CategoryManagerDrawerProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: listCategories, enabled: open });

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      form.resetFields();
    },
    onError: () => message.error('Kategoriya yaratib bo‘lmadi'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      message.success('Kategoriya o‘chirildi');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail ?? 'O‘chirib bo‘lmadi — unga bog‘langan mahsulotlar bor');
    },
  });

  return (
    <Drawer title="Kategoriyalarni boshqarish" open={open} onClose={onClose} size={420}>
      <Form form={form} layout="inline" onFinish={(values) => createMutation.mutate(values)} style={{ marginBottom: 16 }}>
        <Form.Item name="name" rules={[{ required: true, message: 'Nomi kerak' }]} style={{ flex: 1 }}>
          <Input placeholder="Yangi kategoriya nomi" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={createMutation.isPending} />
        </Form.Item>
      </Form>

      <List
        loading={categoriesQuery.isLoading}
        dataSource={categoriesQuery.data}
        locale={{ emptyText: <EmptyState title="Kategoriyalar yo'q" /> }}
        renderItem={(category) => (
          <List.Item
            actions={[
              <Popconfirm
                key="delete"
                title="Kategoriyani o'chirish"
                description="Rostdan ham o'chirmoqchimisiz?"
                onConfirm={() => deleteMutation.mutate(category.id)}
              >
                <Button loading={deleteMutation.isPending} danger size="small" icon={<DeleteOutlined />} />
              </Popconfirm>,
            ]}
          >
            <Space>
              {category.name}
              <span style={{ color: '#999' }}>({category._count?.products ?? 0} mahsulot)</span>
            </Space>
          </List.Item>
        )}
      />
    </Drawer>
  );
}
