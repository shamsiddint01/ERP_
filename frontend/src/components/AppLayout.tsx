import {
  AccountBookOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  BellOutlined,
  BookOutlined,
  BorderOutlined,
  CalendarOutlined,
  CarryOutOutlined,
  CheckSquareOutlined,
  ClusterOutlined,
  ContactsOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  FormOutlined,
  GroupOutlined,
  IdcardOutlined,
  InboxOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PercentageOutlined,
  PieChartOutlined,
  ReadOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  SolutionOutlined,
  TeamOutlined,
  TruckOutlined,
  UserAddOutlined,
  UserOutlined,
  UserSwitchOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Avatar, Breadcrumb, Button, Drawer, Dropdown, Grid, Layout, Menu, Space, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { getRequiredPermission } from '../config/routePermissions';
import { palette } from '../theme';
import { avatarColor } from '../utils/avatarColor';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';
import { useAuthStore } from '../store/auth.store';
import { NotificationBell } from './NotificationBell';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

interface MenuLeaf {
  key: string;
  icon: ReactNode;
  label: ReactNode;
  show: boolean;
}

interface MenuGroup {
  key: string;
  icon: ReactNode;
  label: ReactNode;
  children: MenuLeaf[];
}

/**
 * Plain-text labels for the header breadcrumb, kept deliberately separate
 * from the Menu items above (whose `label` is JSX) rather than restructuring
 * that already-correct, working navigation — a small, low-risk lookup next
 * to it instead of a bigger refactor of it.
 */
const ROUTE_LABELS: Record<string, { group: string; page: string }> = {
  '/students': { group: "Ta'lim", page: "O'quvchilar" },
  '/guardians': { group: "Ta'lim", page: 'Ota-onalar/Vasiylar' },
  '/leads': { group: "Ta'lim", page: 'Lidlar' },
  '/courses': { group: "Ta'lim", page: 'Kurslar' },
  '/branches': { group: "Ta'lim", page: 'Filiallar' },
  '/classrooms': { group: "Ta'lim", page: 'Xonalar' },
  '/groups': { group: "Ta'lim", page: 'Guruhlar' },
  '/enrollments': { group: "Ta'lim", page: 'Yozilishlar' },
  '/schedules': { group: "Ta'lim", page: 'Dars jadvallari' },
  '/lessons': { group: "Ta'lim", page: 'Darslar' },
  '/attendance/student': { group: "Ta'lim", page: "O'quvchilar davomati" },
  '/exams': { group: "Ta'lim", page: 'Imtihonlar / Baholar' },
  '/education-reports': { group: "Ta'lim", page: 'Hisobotlar' },
  '/employees': { group: 'HR', page: 'Xodimlar' },
  '/teachers': { group: 'HR', page: "O'qituvchilar" },
  '/departments': { group: 'HR', page: "Bo'limlar" },
  '/positions': { group: 'HR', page: 'Lavozimlar' },
  '/attendance': { group: 'HR', page: 'Xodimlar davomati' },
  '/compensation': { group: 'HR', page: 'Xodimlar maoshi' },
  '/payroll': { group: 'HR', page: 'Ish haqi' },
  '/tuition': { group: 'Moliya', page: "O'quv to'lovlari" },
  '/discounts': { group: 'Moliya', page: 'Chegirmalar' },
  '/payments': { group: 'Moliya', page: "To'lovlar" },
  '/finance/student-balances': { group: 'Moliya', page: "O'quvchilar balansi" },
  '/expenses': { group: 'Moliya', page: 'Xarajatlar' },
  '/finance/accounts': { group: 'Moliya', page: 'Hisoblar rejasi' },
  '/finance/reports': { group: 'Moliya', page: 'Hisobotlar' },
  '/notifications': { group: 'Tizim', page: 'Bildirishnomalar' },
  '/users': { group: 'Tizim', page: 'Foydalanuvchilar' },
  '/roles': { group: 'Tizim', page: 'Rollar' },
  '/audit-log': { group: 'Tizim', page: 'Audit jurnali' },
  '/settings': { group: 'Tizim', page: 'Sozlamalar' },
  '/customers': { group: 'Eski operatsiyalar', page: 'Mijozlar' },
  '/orders': { group: 'Eski operatsiyalar', page: 'Sotuvlar' },
  '/invoices': { group: 'Eski operatsiyalar', page: 'Hisob-fakturalar' },
  '/products': { group: 'Eski operatsiyalar', page: 'Mahsulotlar' },
  '/inventory': { group: 'Eski operatsiyalar', page: 'Ombor' },
  '/warehouses': { group: 'Eski operatsiyalar', page: 'Omborlar' },
  '/suppliers': { group: 'Eski operatsiyalar', page: 'Yetkazib beruvchilar' },
  '/purchases': { group: 'Eski operatsiyalar', page: 'Xaridlar' },
};

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

  // Any navigation (menu click, back button, breadcrumb, deep link) should
  // close the mobile drawer. Adjusting state during render (React's own
  // recommended pattern for "reset state when a prop changes") rather than
  // in an effect — watching the route directly is also more robust than
  // relying on the Menu's own onClick firing through a nested <Link>.
  const [lastPathname, setLastPathname] = useState(location.pathname);
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname);
    setMobileMenuOpen(false);
  }

  const { menuItems, defaultOpenKeys } = useMemo(() => {
    const dashboard: MenuLeaf = { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link>, show: true };

    const education: MenuGroup = {
      key: 'group-education',
      icon: <ReadOutlined />,
      label: "TA'LIM",
      children: [
        { key: '/students', icon: <UserOutlined />, label: <Link to="/students">O'quvchilar</Link>, show: hasPermission('students', 'VIEW') },
        { key: '/guardians', icon: <ContactsOutlined />, label: <Link to="/guardians">Ota-onalar/Vasiylar</Link>, show: hasPermission('guardians', 'VIEW') },
        { key: '/leads', icon: <UserAddOutlined />, label: <Link to="/leads">Lidlar</Link>, show: hasPermission('leads', 'VIEW') },
        { key: '/courses', icon: <BookOutlined />, label: <Link to="/courses">Kurslar</Link>, show: hasPermission('courses', 'VIEW') },
        { key: '/branches', icon: <ApartmentOutlined />, label: <Link to="/branches">Filiallar</Link>, show: hasPermission('branches', 'VIEW') },
        { key: '/classrooms', icon: <BorderOutlined />, label: <Link to="/classrooms">Xonalar</Link>, show: hasPermission('classrooms', 'VIEW') },
        { key: '/groups', icon: <GroupOutlined />, label: <Link to="/groups">Guruhlar</Link>, show: hasPermission('groups', 'VIEW') },
        { key: '/enrollments', icon: <FileDoneOutlined />, label: <Link to="/enrollments">Yozilishlar</Link>, show: hasPermission('enrollments', 'VIEW') },
        { key: '/schedules', icon: <ScheduleOutlined />, label: <Link to="/schedules">Dars jadvallari</Link>, show: hasPermission('schedules', 'VIEW') },
        { key: '/lessons', icon: <CarryOutOutlined />, label: <Link to="/lessons">Darslar</Link>, show: hasPermission('lessons', 'VIEW') },
        {
          key: '/attendance/student',
          icon: <CheckSquareOutlined />,
          label: <Link to="/attendance/student">O'quvchilar davomati</Link>,
          show: hasPermission('student_attendance', 'VIEW'),
        },
        { key: '/exams', icon: <FormOutlined />, label: <Link to="/exams">Imtihonlar / Baholar</Link>, show: hasPermission('exams', 'VIEW') },
        {
          key: '/education-reports',
          icon: <BarChartOutlined />,
          label: <Link to="/education-reports">Ta'lim hisobotlari</Link>,
          show:
            hasPermission('students', 'VIEW') ||
            hasPermission('groups', 'VIEW') ||
            hasPermission('student_attendance', 'VIEW') ||
            hasPermission('grades', 'VIEW') ||
            hasPermission('tuition', 'VIEW') ||
            hasPermission('teachers', 'VIEW') ||
            hasPermission('leads', 'VIEW') ||
            hasPermission('branches', 'VIEW'),
        },
      ],
    };

    const hr: MenuGroup = {
      key: 'group-hr',
      icon: <IdcardOutlined />,
      label: 'HR',
      children: [
        { key: '/employees', icon: <IdcardOutlined />, label: <Link to="/employees">Xodimlar</Link>, show: hasPermission('employees', 'VIEW') },
        { key: '/teachers', icon: <UserSwitchOutlined />, label: <Link to="/teachers">O'qituvchilar</Link>, show: hasPermission('teachers', 'VIEW') },
        { key: '/departments', icon: <ClusterOutlined />, label: <Link to="/departments">Bo'limlar</Link>, show: hasPermission('departments', 'VIEW') },
        { key: '/positions', icon: <SolutionOutlined />, label: <Link to="/positions">Lavozimlar</Link>, show: hasPermission('positions', 'VIEW') },
        { key: '/attendance', icon: <CalendarOutlined />, label: <Link to="/attendance">Xodimlar davomati</Link>, show: hasPermission('attendance', 'VIEW') },
        { key: '/compensation', icon: <CreditCardOutlined />, label: <Link to="/compensation">Xodimlar maoshi</Link>, show: hasPermission('compensation', 'VIEW') },
        { key: '/payroll', icon: <AccountBookOutlined />, label: <Link to="/payroll">Ish haqi (Payroll)</Link>, show: hasPermission('payroll', 'VIEW') },
      ],
    };

    const finance: MenuGroup = {
      key: 'group-finance',
      icon: <WalletOutlined />,
      label: 'MOLIYA',
      children: [
        { key: '/tuition', icon: <WalletOutlined />, label: <Link to="/tuition">O'quv to'lovlari</Link>, show: hasPermission('tuition', 'VIEW') },
        { key: '/discounts', icon: <PercentageOutlined />, label: <Link to="/discounts">Chegirmalar</Link>, show: hasPermission('discounts', 'VIEW') },
        { key: '/payments', icon: <DollarOutlined />, label: <Link to="/payments">To'lovlar</Link>, show: hasPermission('payments', 'VIEW') },
        {
          key: '/finance/student-balances',
          icon: <FileTextOutlined />,
          label: <Link to="/finance/student-balances">O'quvchilar balansi</Link>,
          show: hasPermission('reports', 'VIEW'),
        },
        { key: '/expenses', icon: <WalletOutlined />, label: <Link to="/expenses">Xarajatlar</Link>, show: hasPermission('expenses', 'VIEW') },
        { key: '/finance/accounts', icon: <BankOutlined />, label: <Link to="/finance/accounts">Hisoblar rejasi</Link>, show: hasPermission('finance', 'VIEW') },
        { key: '/finance/reports', icon: <PieChartOutlined />, label: <Link to="/finance/reports">Moliyaviy hisobotlar</Link>, show: hasPermission('reports', 'VIEW') },
      ],
    };

    const system: MenuGroup = {
      key: 'group-system',
      icon: <SettingOutlined />,
      label: 'TIZIM',
      children: [
        { key: '/notifications', icon: <BellOutlined />, label: <Link to="/notifications">Bildirishnomalar</Link>, show: true },
        { key: '/users', icon: <TeamOutlined />, label: <Link to="/users">Foydalanuvchilar</Link>, show: hasPermission('users', 'VIEW') },
        { key: '/roles', icon: <SafetyCertificateOutlined />, label: <Link to="/roles">Rollar va ruxsatlar</Link>, show: hasPermission('roles', 'VIEW') },
        { key: '/audit-log', icon: <AuditOutlined />, label: <Link to="/audit-log">Audit jurnali</Link>, show: hasPermission('audit_logs', 'VIEW') },
        { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">Sozlamalar</Link>, show: hasPermission('settings', 'VIEW') },
      ],
    };

    // Phase L — retail-only modules, demoted out of primary navigation but
    // never deleted. Collapsed by default (see defaultOpenKeys below).
    const legacy: MenuGroup = {
      key: 'group-legacy',
      icon: <InboxOutlined />,
      label: 'ESKI OPERATSIYALAR',
      children: [
        { key: '/customers', icon: <UserOutlined />, label: <Link to="/customers">Mijozlar</Link>, show: hasPermission('customers', 'VIEW') },
        { key: '/orders', icon: <ShoppingOutlined />, label: <Link to="/orders">Sotuvlar</Link>, show: hasPermission('orders', 'VIEW') },
        { key: '/invoices', icon: <FileTextOutlined />, label: <Link to="/invoices">Hisob-fakturalar</Link>, show: hasPermission('invoices', 'VIEW') },
        { key: '/products', icon: <AppstoreOutlined />, label: <Link to="/products">Mahsulotlar</Link>, show: hasPermission('products', 'VIEW') },
        { key: '/inventory', icon: <DatabaseOutlined />, label: <Link to="/inventory">Ombor</Link>, show: hasPermission('inventory', 'VIEW') },
        { key: '/warehouses', icon: <ShopOutlined />, label: <Link to="/warehouses">Omborlar</Link>, show: hasPermission('inventory', 'VIEW') },
        { key: '/suppliers', icon: <TruckOutlined />, label: <Link to="/suppliers">Yetkazib beruvchilar</Link>, show: hasPermission('suppliers', 'VIEW') },
        { key: '/purchases', icon: <ShoppingCartOutlined />, label: <Link to="/purchases">Xaridlar</Link>, show: hasPermission('purchases', 'VIEW') },
      ],
    };

    function visibleChildren(group: MenuGroup) {
      return group.children.filter((item) => item.show).map(({ key, icon, label }) => ({ key, icon, label }));
    }

    const groups = [education, hr, finance, system, legacy]
      .map((group) => ({ ...group, visible: visibleChildren(group) }))
      .filter((group) => group.visible.length > 0);

    const items = [
      { key: dashboard.key, icon: dashboard.icon, label: dashboard.label },
      ...groups.map((group) => ({ key: group.key, icon: group.icon, label: group.label, children: group.visible })),
    ];

    // Every group starts expanded except Legacy (Phase L: "Collapse the
    // section by default" and "Do not show legacy modules as primary
    // navigation").
    const openKeys = groups.filter((g) => g.key !== 'group-legacy').map((g) => g.key);

    return { menuItems: items, defaultOpenKeys: openKeys };
  }, [hasPermission]);

  // `/finance/*` has two-segment menu keys (e.g. "/finance/accounts"); everything else is one segment.
  const pathParts = location.pathname.split('/');
  const selectedMenuKey = pathParts[1] === 'finance' ? `/${pathParts[1]}/${pathParts[2] ?? ''}` : `/${pathParts[1] ?? ''}`;

  // Phase K — a route-level safety net so a stale bookmark/shared link/typed
  // URL to a page the caller isn't permitted for shows a proper 403 page
  // instead of a broken/empty one. The backend remains the real boundary —
  // this only improves what the UI does before that rejection would happen.
  const requiredPermission = getRequiredPermission(location.pathname);
  const isRouteAllowed = !requiredPermission || hasPermission(requiredPermission.module, requiredPermission.action);

  async function handleLogout() {
    await logout().catch(() => undefined);
    clear();
    navigate('/login', { replace: true });
  }

  const breadcrumbEntry = ROUTE_LABELS[selectedMenuKey];
  const userName = user?.fullName ?? '';
  const sidebarCollapsed = isMobile ? false : collapsed;

  const logoBlock = (
    <div
      style={{
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
        gap: 10,
        padding: '18px 20px',
        fontWeight: 600,
        fontSize: 16,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: palette.primary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 15,
        }}
      >
        <ReadOutlined />
      </div>
      {!sidebarCollapsed && <span>Ta'lim Markazi</span>}
    </div>
  );

  const menu = (
    <Menu
      theme="dark"
      mode="inline"
      inlineCollapsed={sidebarCollapsed}
      selectedKeys={[selectedMenuKey]}
      defaultOpenKeys={defaultOpenKeys}
      items={menuItems}
      style={{ overflowY: 'auto', height: 'calc(100vh - 66px)', borderInlineEnd: 'none' }}
    />
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider width={240} collapsedWidth={80} collapsed={collapsed} trigger={null}>
          {logoBlock}
          {menu}
        </Sider>
      )}
      {isMobile && (
        <Drawer
          placement="left"
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          closable={false}
          width={240}
          styles={{ body: { padding: 0, background: palette.sidebarBg } }}
        >
          {logoBlock}
          {menu}
        </Drawer>
      )}
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid #EEF0F3',
          }}
        >
          <Space size={12}>
            <Button
              type="text"
              icon={(isMobile ? mobileMenuOpen : collapsed) ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => (isMobile ? setMobileMenuOpen((prev) => !prev) : setCollapsed((prev) => !prev))}
              aria-label="Menyuni ochish/yopish"
            />
            {breadcrumbEntry && (
              <Breadcrumb
                items={[{ title: breadcrumbEntry.group }, { title: breadcrumbEntry.page }]}
                separator={<RightOutlined style={{ fontSize: 9 }} />}
                style={{ display: isMobile ? 'none' : 'block' }}
              />
            )}
          </Space>
          <Space size={16}>
            <NotificationBell />
            <Dropdown
              menu={{
                items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Chiqish', onClick: handleLogout }],
              }}
            >
              <Space style={{ cursor: 'pointer' }}>
                <Avatar style={{ background: avatarColor(userName), fontWeight: 600 }}>{userName.charAt(0)}</Avatar>
                <div style={{ lineHeight: 1.3, display: isMobile ? 'none' : 'block' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{userName}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {user?.role}
                  </Typography.Text>
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content key={location.pathname} className="page-enter" style={{ margin: isMobile ? 12 : 24 }}>
          {isRouteAllowed ? <Outlet /> : <AccessDeniedPage />}
        </Content>
      </Layout>
    </Layout>
  );
}
