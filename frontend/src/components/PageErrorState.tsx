import { Button, Result } from 'antd';

/**
 * Shared query-failure state — deliberately never renders the underlying
 * error/exception text (no stack trace, no backend detail) so a query error
 * can never leak internals; only a safe, static message plus a retry button.
 */
export function PageErrorState({ onRetry, title, description }: { onRetry?: () => void; title?: string; description?: string }) {
  return (
    <Result
      className="state-enter"
      status="error"
      title={title ?? "Ma'lumotlarni yuklashda xatolik yuz berdi"}
      subTitle={description ?? "Internet aloqasi yoki serverda muammo bo'lishi mumkin. Qayta urinib ko'ring."}
      extra={
        onRetry && (
          <Button type="primary" onClick={onRetry}>
            Qayta urinish
          </Button>
        )
      }
    />
  );
}
