import { BookOutlined, CalendarOutlined, FormOutlined, GroupOutlined, HomeOutlined, LineChartOutlined, SettingOutlined, WalletOutlined } from '@ant-design/icons';
import { AppShell, type NavItem } from '../../components/AppShell';

const MAIN_ITEMS: NavItem[] = [
  { key: '/', icon: <HomeOutlined />, label: 'Bosh sahifa' },
  { key: '/homework', icon: <BookOutlined />, label: 'Uy ishi' },
  { key: '/groups', icon: <GroupOutlined />, label: 'Guruhlar' },
  { key: '/payments', icon: <WalletOutlined />, label: "To'lovlarim" },
  { key: '/exams', icon: <FormOutlined />, label: 'Imtihon' },
  { key: '/progress', icon: <LineChartOutlined />, label: "Ko'rsatkichlarim" },
  { key: '/extra-lessons', icon: <CalendarOutlined />, label: "Qo'shimcha darslar" },
];
const SETTINGS_ITEM: NavItem = { key: '/settings', icon: <SettingOutlined />, label: 'Sozlamalar' };

const SECTION_BY_SEGMENT: Record<string, string> = Object.fromEntries(
  [...MAIN_ITEMS, SETTINGS_ITEM].map((item) => [item.key.slice(1), item.key]),
);
const SECTION_LABELS: Record<string, string> = Object.fromEntries([...MAIN_ITEMS, SETTINGS_ITEM].map((item) => [item.key, item.label]));

/** The student's own cabinet — same shell as the staff app, its own 7 sections + Sozlamalar. */
export function PortalLayout() {
  return (
    <AppShell
      mainItems={MAIN_ITEMS}
      bottomItem={SETTINGS_ITEM}
      sectionBySegment={SECTION_BY_SEGMENT}
      sectionLabels={SECTION_LABELS}
      subtitle="O'quvchi kabineti"
      showNotifications={false}
    />
  );
}
