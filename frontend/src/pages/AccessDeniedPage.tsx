import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

export function AccessDeniedPage() {
  const navigate = useNavigate();

  return (
    <Result
      status="403"
      title="403"
      subTitle="Kechirasiz, sizda ushbu sahifani ko'rish uchun ruxsat yo'q."
      extra={
        <Button type="primary" onClick={() => navigate('/')}>
          Bosh sahifaga qaytish
        </Button>
      }
    />
  );
}
