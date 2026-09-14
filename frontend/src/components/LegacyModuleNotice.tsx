import { Alert } from 'antd';

/**
 * Shown at the top of every legacy retail/warehouse page (Operations (Legacy)
 * nav group). The education center is the primary product now — this module
 * is kept functional only for historical records and any still-open retail
 * activity, never blocking access to either.
 */
export function LegacyModuleNotice() {
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 16 }}
      title="Eski savdo/ombor moduli"
      description="Bu bo'lim asosiy Ta'lim Markazi tizimidan alohida, eski (retail) operatsiyalar uchun saqlangan. Mavjud tarixiy ma'lumotlar va davom etayotgan amallar to'liq ishlaydi, lekin yangi rivojlanish endi ta'lim yo'nalishiga qaratilgan."
    />
  );
}
