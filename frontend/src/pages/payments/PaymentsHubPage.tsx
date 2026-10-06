import { DollarOutlined, FileTextOutlined, PercentageOutlined, WalletOutlined } from '@ant-design/icons';
import { SectionHub } from '../../components/SectionHub';
import { DiscountsPage } from '../discounts/DiscountsPage';
import { StudentBalancesPage } from '../finance/StudentBalancesPage';
import { TuitionPage } from '../tuition/TuitionPage';
import { PaymentsPage } from './PaymentsPage';

export function PaymentsHubPage() {
  return (
    <SectionHub
      tabs={[
        { key: 'payments', label: "To'lovlar", icon: <DollarOutlined />, permission: { module: 'payments', action: 'VIEW' }, element: <PaymentsPage /> },
        { key: 'charges', label: 'Hisob-kitoblar', icon: <FileTextOutlined />, permission: { module: 'tuition', action: 'VIEW' }, element: <TuitionPage /> },
        { key: 'balances', label: 'Qarzdorlik', icon: <WalletOutlined />, permission: { module: 'reports', action: 'VIEW' }, element: <StudentBalancesPage /> },
        { key: 'discounts', label: 'Chegirmalar', icon: <PercentageOutlined />, permission: { module: 'discounts', action: 'VIEW' }, element: <DiscountsPage /> },
      ]}
    />
  );
}
