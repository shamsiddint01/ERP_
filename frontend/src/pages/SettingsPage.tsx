import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input } from 'antd';
import { useEffect } from 'react';
import { getSettings, updateSettings } from '../api/settings';
import { PageErrorState } from '../components/PageErrorState';
import { PageHeader } from '../components/PageHeader';

export function SettingsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  useEffect(() => {
    if (settingsQuery.data) form.setFieldsValue(settingsQuery.data);
  }, [settingsQuery.data, form]);

  const updateMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      message.success('Sozlamalar saqlandi');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => message.error('Saqlab bo‘lmadi'),
  });

  if (settingsQuery.isError && !settingsQuery.data) {
    return <PageErrorState onRetry={() => settingsQuery.refetch()} />;
  }

  return (
    <div>
      <PageHeader title="Kompaniya sozlamalari" />
      <Card style={{ maxWidth: 480 }}>
        <Form form={form} layout="vertical" onFinish={(values) => updateMutation.mutate(values)}>
          <Form.Item name="companyName" label="Kompaniya nomi" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="currency" label="Valyuta">
            <Input />
          </Form.Item>
          <Form.Item name="timezone" label="Vaqt zonasi">
            <Input />
          </Form.Item>
          <Form.Item name="defaultLanguage" label="Til">
            <Input />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>
              Saqlash
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
