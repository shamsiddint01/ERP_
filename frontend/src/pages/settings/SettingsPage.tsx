import { BankOutlined, DeleteOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Form, Input, Popconfirm, Row, Select, Skeleton, Space, Typography, Upload } from 'antd';
import { useEffect } from 'react';
import { getSettings, removeLogo, updateSettings, uploadLogo } from '../../api/settings';
import { BrandMark } from '../../components/BrandMark';
import { FormSection } from '../../components/FormSection';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { useAuthStore } from '../../store/auth.store';
import { palette } from '../../theme';
import type { CompanySettings } from '../../types';
import { formatDateTime } from '../../utils/format';

type FormValues = Pick<CompanySettings, 'companyName' | 'currency' | 'defaultLanguage'>;

// Must stay in sync with backend/src/modules/settings/dto/update-settings.dto.ts.
const CURRENCY_OPTIONS = [
  { value: 'UZS', label: "UZS — O'zbek so'mi" },
  { value: 'USD', label: 'USD — AQSh dollari' },
  { value: 'EUR', label: 'EUR — Yevro' },
  { value: 'RUB', label: 'RUB — Rossiya rubli' },
];
const LANGUAGE_OPTIONS = [
  { value: 'uz', label: "O'zbekcha" },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
];

// Must stay in sync with backend/src/modules/settings/logo-image.util.ts (the server re-checks every one of these).
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 512 * 1024;
const LOGO_MIN_SIDE = 128;

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error('unreadable'));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function apiError(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(detail) ? detail.join(', ') : (detail ?? fallback);
}

export function SettingsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((state) => state.hasPermission('settings', 'EDIT'));
  const [form] = Form.useForm<FormValues>();
  const companyName = Form.useWatch('companyName', form);

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  useEffect(() => {
    if (settingsQuery.data) form.setFieldsValue(settingsQuery.data);
  }, [settingsQuery.data, form]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['settings'] });
    queryClient.invalidateQueries({ queryKey: ['branding'] });
  }

  const updateMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      message.success('Sozlamalar saqlandi');
      refresh();
    },
    onError: (error) => message.error(apiError(error, "Saqlab bo'lmadi")),
  });

  const uploadMutation = useMutation({
    mutationFn: uploadLogo,
    onSuccess: () => {
      message.success('Logotip yangilandi');
      refresh();
    },
    onError: (error) => message.error(apiError(error, "Logotipni yuklab bo'lmadi")),
  });

  const removeMutation = useMutation({
    mutationFn: removeLogo,
    onSuccess: () => {
      message.success("Logotip o'chirildi");
      refresh();
    },
    onError: (error) => message.error(apiError(error, "Logotipni o'chirib bo'lmadi")),
  });

  /** Checks the file before sending it (type, size, dimensions); returns false so AntD never auto-uploads on its own. */
  async function handleLogoSelected(file: File) {
    if (!LOGO_TYPES.includes(file.type)) {
      message.error('Faqat PNG, JPG yoki WEBP rasm yuklash mumkin');
      return false;
    }
    if (file.size > LOGO_MAX_BYTES) {
      message.error(`Rasm hajmi 512 KB dan oshmasligi kerak (hozir ${Math.ceil(file.size / 1024)} KB)`);
      return false;
    }
    try {
      const { width, height } = await readImageSize(file);
      if (Math.min(width, height) < LOGO_MIN_SIDE) {
        message.error(`Rasm juda kichik (${width}×${height} px). Kamida ${LOGO_MIN_SIDE}×${LOGO_MIN_SIDE} px bo'lsin`);
        return false;
      }
      if (Math.abs(width - height) / Math.max(width, height) > 0.1) {
        message.warning(`Rasm kvadrat emas (${width}×${height} px) — kvadrat ichiga sig'diriladi, chetlarida bo'sh joy qoladi`);
      }
    } catch {
      message.error("Rasmni o'qib bo'lmadi");
      return false;
    }
    uploadMutation.mutate(file);
    return false;
  }

  if (settingsQuery.isError && !settingsQuery.data) {
    return <PageErrorState onRetry={() => settingsQuery.refetch()} />;
  }

  const settings = settingsQuery.data;
  const displayName = companyName || settings?.companyName || '';

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader
        title="Sozlamalar"
        subtitle={settings ? `Oxirgi o'zgarish: ${formatDateTime(settings.updatedAt)}` : undefined}
        extra={
          canEdit && (
            <Button type="primary" icon={<SaveOutlined />} loading={updateMutation.isPending} onClick={() => form.submit()}>
              Saqlash
            </Button>
          )
        }
      />

      {settingsQuery.isLoading || !settings ? (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : (
        <Card>
          <FormSection title="Logotip">
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <BrandMark size={88} logoUrl={settings.logoUrl} />
              <div style={{ flex: 1, minWidth: 240 }}>
                <Typography.Title level={5} style={{ margin: 0 }} ellipsis>
                  {displayName || 'Markaz nomi'}
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 12px' }}>
                  Kvadrat rasm (1:1), kamida 256×256 px, tavsiya 512×512 px · PNG, JPG yoki WEBP · 512 KB gacha. Eng yaxshisi — shaffof fonli PNG.
                  Logotip menyuda va kirish sahifasida ko'rinadi.
                </Typography.Paragraph>
                {canEdit && (
                  <Space wrap>
                    <Upload accept=".png,.jpg,.jpeg,.webp" showUploadList={false} beforeUpload={handleLogoSelected} disabled={uploadMutation.isPending}>
                      <Button icon={<UploadOutlined />} loading={uploadMutation.isPending}>
                        {settings.logoUrl ? 'Almashtirish' : 'Rasm yuklash'}
                      </Button>
                    </Upload>
                    {settings.logoUrl && (
                      <Popconfirm title="Logotipni o'chirasizmi?" onConfirm={() => removeMutation.mutate()}>
                        <Button danger icon={<DeleteOutlined />} loading={removeMutation.isPending}>
                          O'chirish
                        </Button>
                      </Popconfirm>
                    )}
                  </Space>
                )}
              </div>
            </div>
          </FormSection>

          <div style={{ borderTop: `1px solid ${palette.border}`, margin: '4px 0 20px' }} />

          <Form form={form} layout="vertical" disabled={!canEdit} requiredMark={false} onFinish={(values) => updateMutation.mutate(values)}>
            <FormSection title="O'quv markazi">
              <Form.Item name="companyName" label="Markaz nomi" rules={[{ required: true, whitespace: true, message: 'Markaz nomini kiriting' }]} style={{ marginBottom: 0 }}>
                <Input prefix={<BankOutlined />} placeholder="Masalan: Bilim o'quv markazi" />
              </Form.Item>
            </FormSection>

            <FormSection title="Mintaqa">
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="currency" label="Valyuta" style={{ marginBottom: 0 }}>
                    <Select options={CURRENCY_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="defaultLanguage" label="Til" style={{ marginBottom: 0 }}>
                    <Select options={LANGUAGE_OPTIONS} />
                  </Form.Item>
                </Col>
              </Row>
            </FormSection>
          </Form>
        </Card>
      )}
    </div>
  );
}
