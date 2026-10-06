import {
  BarChartOutlined,
  CheckSquareOutlined,
  DollarOutlined,
  FormOutlined,
  GroupOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  TeamOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Drawer, Dropdown, Grid, Layout, Menu, Space, Tooltip, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { getRequiredPermission } from '../config/routePermissions';
import { palette } from '../theme';
import { avatarColor } from '../utils/avatarColor';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';
import { useAuthStore } from '../store/auth.store';
import { useBranding } from '../hooks/useBranding';
import { BrandMark } from './BrandMark';
import { NotificationBell } from './NotificationBell';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

interface NavItem {
  key: string;
  icon: ReactNode;
  label: string;
  show: boolean;
}

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

const SIDEBAR_WIDTH = 248;

export function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const clear = useAuthStore((state) => state.clear);
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const screens = useBreakpoint();
  const isMobile = screens.md === false;
  const { data: branding } = useBranding();

  // Any navigation (menu click, back button, deep link) should close the
  // mobile drawer. Adjusting state during render (React's own recommended
  // pattern for "reset state when a prop changes") rather than in an effect.
  const [lastPathname, setLastPathname] = useState(location.pathname);
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname);
    setMobileMenuOpen(false);
  }

  const { mainItems, settingsItem } = useMemo(() => {
    const any = (...modules: string[]) => modules.some((module) => hasPermission(module, 'VIEW'));
    const main: NavItem[] = [
      { key: '/', icon: <HomeOutlined />, label: 'Bosh sahifa', show: true },
      { key: '/students', icon: <TeamOutlined />, label: "O'quvchilar", show: any('students') },
      { key: '/teachers', icon: <UserSwitchOutlined />, label: "O'qituvchilar", show: any('teachers') },
      { key: '/groups', icon: <GroupOutlined />, label: 'Guruhlar', show: any('groups') },
      { key: '/attendance', icon: <CheckSquareOutlined />, label: 'Davomat', show: any('lessons', 'student_attendance') },
      { key: '/payments', icon: <DollarOutlined />, label: "To'lovlar", show: any('payments', 'tuition', 'discounts', 'reports') },
      { key: '/exams', icon: <FormOutlined />, label: 'Testlar', show: any('exams') },
      {
        key: '/reports',
        icon: <BarChartOutlined />,
        label: 'Hisobotlar',
        show: any('students', 'groups', 'student_attendance', 'grades', 'tuition', 'teachers', 'branches'),
      },
    ];
    const settings: NavItem = {
      key: '/settings',
      icon: <SettingOutlined />,
      label: 'Sozlamalar',
      show: any('settings'),
    };
    return { mainItems: main.filter((item) => item.show), settingsItem: settings.show ? settings : null };
  }, [hasPermission]);

  const selectedSection = SECTION_BY_SEGMENT[location.pathname.split('/')[1] ?? ''] ?? '';

  // A route-level safety net so a stale bookmark / shared link / typed URL
  // to a page the caller isn't permitted for shows a proper 403 page instead
  // of a broken one. The backend remains the real boundary.
  const requiredPermission = getRequiredPermission(location.pathname);
  const isRouteAllowed = !requiredPermission || hasPermission(requiredPermission.module, requiredPermission.action);

  async function handleLogout() {
    await logout().catch(() => undefined);
    clear();
    navigate('/login', { replace: true });
  }

  const userName = user?.fullName ?? '';
  const sidebarCollapsed = isMobile ? false : collapsed;

  const toMenuItems = (items: NavItem[]) =>
    items.map((item) => ({ key: item.key, icon: item.icon, label: <Link to={item.key}>{item.label}</Link> }));

  const logoBlock = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
        gap: 12,
        padding: sidebarCollapsed ? '22px 0' : '22px 22px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <BrandMark size={36} logoUrl={branding?.logoUrl} />
      {!sidebarCollapsed && (
        <div style={{ lineHeight: 1.2 }}>
          <Typography.Text ellipsis style={{ display: 'block', maxWidth: 160, color: palette.text, fontWeight: 700, fontSize: 15, letterSpacing: '0.02em' }}>
            {branding?.companyName ?? "Ta'lim Markazi"}
          </Typography.Text>
          <div className="eyebrow" style={{ fontSize: 10, marginTop: 2 }}>
            Boshqaruv paneli
          </div>
        </div>
      )}
    </div>
  );

  const sidebarBody = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {logoBlock}
      {!sidebarCollapsed && (
        <div className="eyebrow" style={{ padding: '6px 24px 8px', fontSize: 10 }}>
          Menyu
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Menu
          className="app-sidebar-menu"
          theme="dark"
          mode="inline"
          inlineCollapsed={sidebarCollapsed}
          selectedKeys={[selectedSection]}
          items={toMenuItems(mainItems)}
          style={{ borderInlineEnd: 'none' }}
        />
      </div>
      <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: 8 }}>
        {settingsItem && (
          <Menu
            className="app-sidebar-menu"
            theme="dark"
            mode="inline"
            inlineCollapsed={sidebarCollapsed}
            selectedKeys={[selectedSection]}
            items={toMenuItems([settingsItem])}
            style={{ borderInlineEnd: 'none' }}
          />
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: 10,
            margin: '8px 12px 14px',
            padding: sidebarCollapsed ? '10px 0' : '10px 12px',
            borderRadius: 12,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
          }}
        >
          <Avatar style={{ background: avatarColor(userName), fontWeight: 700, flexShrink: 0 }}>{userName.charAt(0)}</Avatar>
          {!sidebarCollapsed && (
            <>
              <div style={{ minWidth: 0, flex: 1, lineHeight: 1.3 }}>
                <Typography.Text ellipsis style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
                  {userName}
                </Typography.Text>
                <Typography.Text ellipsis type="secondary" style={{ display: 'block', fontSize: 11 }}>
                  {user?.role}
                </Typography.Text>
              </div>
              <Tooltip title="Chiqish">
                <Button type="text" size="small" icon={<LogoutOutlined />} onClick={handleLogout} aria-label="Chiqish" />
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider
          width={SIDEBAR_WIDTH}
          collapsedWidth={84}
          collapsed={collapsed}
          trigger={null}
          style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}
        >
          {sidebarBody}
        </Sider>
      )}
      {isMobile && (
        <Drawer
          placement="left"
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          closable={false}
          size={SIDEBAR_WIDTH}
          styles={{ body: { padding: 0, background: palette.sidebarBg } }}
        >
          {sidebarBody}
        </Drawer>
      )}
      <Layout className="app-content-bg">
        <Header
          style={{
            padding: isMobile ? '0 12px' : '0 28px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            height: 64,
            borderBottom: `1px solid ${palette.border}`,
            background: 'rgba(23, 24, 28, 0.72)',
            backdropFilter: 'blur(10px)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Space size={12} style={{ minWidth: 0 }}>
            <Button
              type="text"
              icon={(isMobile ? mobileMenuOpen : collapsed) ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => (isMobile ? setMobileMenuOpen((prev) => !prev) : setCollapsed((prev) => !prev))}
              aria-label="Menyuni ochish/yopish"
            />
            <div className="eyebrow" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {!isMobile && <span>Ta'lim markazi&nbsp;&nbsp;/&nbsp;&nbsp;</span>}
              <span style={{ color: palette.primary }}>{SECTION_LABELS[selectedSection] ?? ''}</span>
            </div>
          </Space>
          <Space size={14}>
            <NotificationBell />
            <Dropdown menu={{ items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Chiqish', onClick: handleLogout }] }}>
              <Avatar style={{ background: avatarColor(userName), fontWeight: 700, cursor: 'pointer' }}>{userName.charAt(0)}</Avatar>
            </Dropdown>
          </Space>
        </Header>
        <Content key={location.pathname} className="page-enter" style={{ padding: isMobile ? 12 : 28 }}>
          {isRouteAllowed ? <Outlet /> : <AccessDeniedPage />}
        </Content>
      </Layout>
    </Layout>
  );
}
