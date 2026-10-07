import { BookOutlined, CalendarOutlined, FormOutlined, GroupOutlined, HomeOutlined, SettingOutlined, WalletOutlined } from '@ant-design/icons';
import { AppShell, type NavItem } from '../../components/AppShell';

const MAIN_ITEMS: NavItem[] = [
  { key: '/', icon: <HomeOutlined />, label: 'Bosh sahifa' },
  { key: '/homework', icon: <BookOutlined />, label: 'Uy ishi' },
  { key: '/groups', icon: <GroupOutlined />, label: 'Guruhlarim' },
  { key: '/exams', icon: <FormOutlined />, label: 'Imtihon' },
  { key: '/schedule', icon: <CalendarOutlined />, label: 'Dars jadvali' },
  { key: '/salary', icon: <WalletOutlined />, label: 'Maosh' },
];
const SETTINGS_ITEM: NavItem = { key: '/settings', icon: <SettingOutlined />, label: 'Sozlamalar' };

/** Detail pages reached from a section keep that section lit (a student / lesson opened from a group, etc.). */
const SECTION_BY_SEGMENT: Record<string, string> = {
  '': '/',
  homework: '/homework',
  groups: '/groups',
  students: '/groups',
  enrollments: '/groups',
  exams: '/exams',
  schedule: '/schedule',
  lessons: '/schedule',
  salary: '/salary',
  settings: '/settings',
  notifications: '/',
};
const SECTION_LABELS: Record<string, string> = Object.fromEntries([...MAIN_ITEMS, SETTINGS_ITEM].map((item) => [item.key, item.label]));

/** The teacher's cabinet — same shell as the staff app, its own sections. Everything shown is already narrowed to the teacher's own groups by the backend. */
export function TeacherLayout() {
  return (
    <AppShell
      mainItems={MAIN_ITEMS}
      bottomItem={SETTINGS_ITEM}
      sectionBySegment={SECTION_BY_SEGMENT}
      sectionLabels={SECTION_LABELS}
      subtitle="Ustoz kabineti"
    />
  );
}
