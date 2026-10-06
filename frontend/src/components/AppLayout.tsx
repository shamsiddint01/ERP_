import {
  BarChartOutlined,
  CheckSquareOutlined,
  DollarOutlined,
  FormOutlined,
  GroupOutlined,
  HomeOutlined,
  SettingOutlined,
  TeamOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { getRequiredPermission } from '../config/routePermissions';
import { useAuthStore } from '../store/auth.store';
import { AppShell, type NavItem } from './AppShell';

/**
 * The first URL segment → the sidebar section it belongs to. Detail pages
 * that live outside their section's own URL (a lesson, an enrollment, a
 * tuition charge, a course...) still light up the section they're reached from.
 */
const SECTION_BY_SEGMENT: Record<string, string> = {
  '': '/',
  students: '/students',
  teachers: '/teachers',
  groups: '/groups',
  enrollments: '/groups',
  attendance: '/attendance',
  lessons: '/attendance',
  payments: '/payments',
  tuition: '/payments',
  exams: '/exams',
  reports: '/reports',
  settings: '/settings',
  courses: '/settings',
  branches: '/settings',
  classrooms: '/settings',
  notifications: '/notifications',
};

const SECTION_LABELS: Record<string, string> = {
  '/': 'Bosh sahifa',
  '/students': "O'quvchilar",
  '/teachers': "O'qituvchilar",
  '/groups': 'Guruhlar',
  '/attendance': 'Davomat',
  '/payments': "To'lovlar",
  '/exams': 'Testlar',
  '/reports': 'Hisobotlar',
  '/settings': 'Sozlamalar',
  '/notifications': 'Bildirishnomalar',
};

/** The staff app: the 8 sections each role's permissions allow, plus Sozlamalar. */
export function AppLayout() {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const location = useLocation();

  const { mainItems, settingsItem } = useMemo(() => {
    const any = (...modules: string[]) => modules.some((module) => hasPermission(module, 'VIEW'));
    const main: (NavItem & { show: boolean })[] = [
      { key: '/', icon: <HomeOutlined />, label: 'Bosh sahifa', show: true },
      { key: '/students', icon: <TeamOutlined />, label: "O'quvchilar", show: any('students') },
      { key: '/teachers', icon: <UserSwitchOutlined />, label: "O'qituvchilar", show: any('teachers') },
      { key: '/groups', icon: <GroupOutlined />, label: 'Guruhlar', show: any('groups') },
      { key: '/attendance', icon: <CheckSquareOutlined />, label: 'Davomat', show: any('lessons', 'student_attendance', 'extra_lessons') },
      { key: '/payments', icon: <DollarOutlined />, label: "To'lovlar", show: any('payments', 'tuition', 'discounts', 'reports') },
      { key: '/exams', icon: <FormOutlined />, label: 'Testlar', show: any('exams') },
      { key: '/reports', icon: <BarChartOutlined />, label: 'Hisobotlar', show: any('students', 'groups', 'student_attendance', 'grades', 'tuition', 'teachers', 'branches') },
    ];
    return {
      mainItems: main.filter((item) => item.show),
      settingsItem: any('settings') ? { key: '/settings', icon: <SettingOutlined />, label: 'Sozlamalar' } : null,
    };
  }, [hasPermission]);

  // A route-level safety net so a stale bookmark / shared link / typed URL
  // to a page the caller isn't permitted for shows a proper 403 page instead
  // of a broken one. The backend remains the real boundary.
  const requiredPermission = getRequiredPermission(location.pathname);
  const isRouteAllowed = !requiredPermission || hasPermission(requiredPermission.module, requiredPermission.action);

  return (
    <AppShell
      mainItems={mainItems}
      bottomItem={settingsItem}
      sectionBySegment={SECTION_BY_SEGMENT}
      sectionLabels={SECTION_LABELS}
      subtitle="Boshqaruv paneli"
      isRouteAllowed={isRouteAllowed}
    />
  );
}
