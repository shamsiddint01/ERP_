import { LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Avatar, Button, Drawer, Dropdown, Grid, Layout, Menu, Tooltip, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { palette } from '../theme';
import { avatarColor } from '../utils/avatarColor';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import { useBranding } from '../hooks/useBranding';
import { BrandMark } from './BrandMark';
import { NotificationBell } from './NotificationBell';
import { ThemeModeSwitch } from './ThemeModeSwitch';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

export interface NavItem {
  key: string;
  icon: ReactNode;
  label: string;
}

interface AppShellProps {
  /** Main sidebar items, already filtered to what the caller may see. */
  mainItems: NavItem[];
  /** Pinned to the bottom of the sidebar (Sozlamalar). */
  bottomItem?: NavItem | null;
  /** First URL segment → sidebar section key, so detail pages light up the section they belong to. */
  sectionBySegment: Record<string, string>;
  /** Section key → label shown in the header breadcrumb. */
  sectionLabels: Record<string, string>;
  /** Small caption under the center's name in the sidebar. */
  subtitle: string;
  /** When false the page area shows the 403 page instead of the route. */
  isRouteAllowed?: boolean;
  /** Show the notification bell in the header. */
  showNotifications?: boolean;
}

const SIDEBAR_WIDTH = 248;

/**
 * The app chrome shared by the staff app and the student portal: sidebar
 * (logo, menu, settings, user card), sticky header with breadcrumb and
 * bell, and the routed page area — mobile gets the sidebar as a drawer.
 */
export function AppShell({ mainItems, bottomItem, sectionBySegment, sectionLabels, subtitle, isRouteAllowed = true, showNotifications = true }: AppShellProps) {
  const user = useAuthStore((state) => state.user);
  const themeMode = useThemeStore((state) => state.mode);
  const clear = useAuthStore((state) => state.clear);
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const screens = useBreakpoint();
  const isMobile = screens.md === false;
  // Tablets (768–991px) start with the icon-only sidebar so the page keeps its room; the user's own toggle wins.
  const isTablet = screens.md === true && screens.lg === false;
  const [collapsedChoice, setCollapsedChoice] = useState<boolean | null>(null);
  const collapsed = collapsedChoice ?? isTablet;
  const { data: branding } = useBranding();

  // Any navigation (menu click, back button, deep link) should close the
  // mobile drawer. Adjusting state during render (React's own recommended
  // pattern for "reset state when a prop changes") rather than in an effect.
  const [lastPathname, setLastPathname] = useState(location.pathname);
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname);
    setMobileMenuOpen(false);
  }

  const selectedSection = sectionBySegment[location.pathname.split('/')[1] ?? ''] ?? '';

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
            {subtitle}
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
          theme={themeMode}
          mode="inline"
          inlineCollapsed={sidebarCollapsed}
          selectedKeys={[selectedSection]}
          items={toMenuItems(mainItems)}
          style={{ borderInlineEnd: 'none' }}
        />
      </div>
      <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: 8 }}>
        {bottomItem && (
          <Menu
            className="app-sidebar-menu"
            theme={themeMode}
            mode="inline"
            inlineCollapsed={sidebarCollapsed}
            selectedKeys={[selectedSection]}
            items={toMenuItems([bottomItem])}
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
          rootClassName="app-mobile-nav"
          styles={{ body: { padding: 0, background: palette.sidebarBg } }}
        >
          {sidebarBody}
        </Drawer>
      )}
      <Layout className="app-content-bg" style={{ minWidth: 0 }}>
        <Header
          style={{
            padding: isMobile ? '0 12px' : isTablet ? '0 20px' : '0 28px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            height: 64,
            borderBottom: `1px solid ${palette.border}`,
            background: 'var(--header-bg)',
            backdropFilter: 'blur(10px)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
            <Button
              className="header-icon-btn"
              icon={(isMobile ? mobileMenuOpen : collapsed) ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => (isMobile ? setMobileMenuOpen((prev) => !prev) : setCollapsedChoice(!collapsed))}
              aria-label="Menyuni ochish/yopish"
            />
            <div className="eyebrow" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
              {!isMobile && <span>Ta'lim markazi&nbsp;&nbsp;/&nbsp;&nbsp;</span>}
              <span style={{ color: palette.primary }}>{sectionLabels[selectedSection] ?? ''}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8, flexShrink: 0 }}>
            <ThemeModeSwitch />
            {showNotifications && <NotificationBell />}
            {!isMobile && <span className="header-divider" style={{ margin: '0 4px' }} />}
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'who', label: <span style={{ fontWeight: 600 }}>{userName}</span>, disabled: true },
                  { type: 'divider' },
                  { key: 'logout', icon: <LogoutOutlined />, label: 'Chiqish', danger: true, onClick: handleLogout },
                ],
              }}
            >
              <Avatar className="header-avatar" shape="square" style={{ background: avatarColor(userName) }} aria-label="Profil">
                {userName.charAt(0)}
              </Avatar>
            </Dropdown>
          </div>
        </Header>
        <Content key={location.pathname} className="page-enter" style={{ padding: isMobile ? 12 : isTablet ? 20 : 28, minWidth: 0 }}>
          {isRouteAllowed ? <Outlet /> : <AccessDeniedPage />}
        </Content>
      </Layout>
    </Layout>
  );
}
