import {
  AccountBookOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
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
  GroupOutlined,
  IdcardOutlined,
  LogoutOutlined,
  PieChartOutlined,
  ReadOutlined,
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
import { Avatar, Dropdown, Layout, Menu, Space, Typography } from 'antd';
import { useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { useAuthStore } from '../store/auth.store';
import { NotificationBell } from './NotificationBell';

const { Header, Sider, Content } = Layout;

export function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const clear = useAuthStore((state) => state.clear);
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = useMemo(() => {
    const candidates = [
      { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link>, show: true },
      { key: '/students', icon: <ReadOutlined />, label: <Link to="/students">O'quvchilar</Link>, show: hasPermission('students', 'VIEW') },
      { key: '/guardians', icon: <ContactsOutlined />, label: <Link to="/guardians">Ota-onalar/Vasiylar</Link>, show: hasPermission('guardians', 'VIEW') },
      { key: '/leads', icon: <UserAddOutlined />, label: <Link to="/leads">Lidlar</Link>, show: hasPermission('leads', 'VIEW') },
      { key: '/courses', icon: <BookOutlined />, label: <Link to="/courses">Kurslar</Link>, show: hasPermission('courses', 'VIEW') },
      { key: '/branches', icon: <ApartmentOutlined />, label: <Link to="/branches">Filiallar</Link>, show: hasPermission('branches', 'VIEW') },
      { key: '/classrooms', icon: <BorderOutlined />, label: <Link to="/classrooms">Xonalar</Link>, show: hasPermission('classrooms', 'VIEW') },
      { key: '/groups', icon: <GroupOutlined />, label: <Link to="/groups">Guruhlar</Link>, show: hasPermission('groups', 'VIEW') },
      { key: '/enrollments', icon: <FileDoneOutlined />, label: <Link to="/enrollments">Yozilishlar</Link>, show: hasPermission('enrollments', 'VIEW') },
      { key: '/schedules', icon: <ScheduleOutlined />, label: <Link to="/schedules">Dars jadvallari</Link>, show: hasPermission('schedules', 'VIEW') },
      { key: '/lessons', icon: <CarryOutOutlined />, label: <Link to="/lessons">Darslar</Link>, show: hasPermission('lessons', 'VIEW') },
      { key: '/customers', icon: <UserOutlined />, label: <Link to="/customers">Mijozlar</Link>, show: hasPermission('customers', 'VIEW') },
      { key: '/orders', icon: <ShoppingOutlined />, label: <Link to="/orders">Sotuvlar</Link>, show: hasPermission('orders', 'VIEW') },
      { key: '/invoices', icon: <FileTextOutlined />, label: <Link to="/invoices">Hisob-fakturalar</Link>, show: hasPermission('invoices', 'VIEW') },
      { key: '/payments', icon: <DollarOutlined />, label: <Link to="/payments">To'lovlar</Link>, show: hasPermission('payments', 'VIEW') },
      { key: '/products', icon: <AppstoreOutlined />, label: <Link to="/products">Mahsulotlar</Link>, show: hasPermission('products', 'VIEW') },
      { key: '/inventory', icon: <DatabaseOutlined />, label: <Link to="/inventory">Ombor</Link>, show: hasPermission('inventory', 'VIEW') },
      { key: '/warehouses', icon: <ShopOutlined />, label: <Link to="/warehouses">Omborlar</Link>, show: hasPermission('inventory', 'VIEW') },
      { key: '/suppliers', icon: <TruckOutlined />, label: <Link to="/suppliers">Yetkazib beruvchilar</Link>, show: hasPermission('suppliers', 'VIEW') },
      { key: '/purchases', icon: <ShoppingCartOutlined />, label: <Link to="/purchases">Xaridlar</Link>, show: hasPermission('purchases', 'VIEW') },
      { key: '/finance/accounts', icon: <BankOutlined />, label: <Link to="/finance/accounts">Hisoblar rejasi</Link>, show: hasPermission('finance', 'VIEW') },
      { key: '/expenses', icon: <WalletOutlined />, label: <Link to="/expenses">Xarajatlar</Link>, show: hasPermission('expenses', 'VIEW') },
      { key: '/finance/reports', icon: <PieChartOutlined />, label: <Link to="/finance/reports">Moliyaviy hisobotlar</Link>, show: hasPermission('reports', 'VIEW') },
      { key: '/employees', icon: <IdcardOutlined />, label: <Link to="/employees">Xodimlar</Link>, show: hasPermission('employees', 'VIEW') },
      { key: '/teachers', icon: <UserSwitchOutlined />, label: <Link to="/teachers">O'qituvchilar</Link>, show: hasPermission('teachers', 'VIEW') },
      { key: '/departments', icon: <ClusterOutlined />, label: <Link to="/departments">Bo'limlar</Link>, show: hasPermission('departments', 'VIEW') },
      { key: '/positions', icon: <SolutionOutlined />, label: <Link to="/positions">Lavozimlar</Link>, show: hasPermission('positions', 'VIEW') },
      { key: '/attendance', icon: <CalendarOutlined />, label: <Link to="/attendance">Davomat</Link>, show: hasPermission('attendance', 'VIEW') },
      {
        key: '/attendance/student',
        icon: <CheckSquareOutlined />,
        label: <Link to="/attendance/student">O'quvchilar davomati</Link>,
        show: hasPermission('student_attendance', 'VIEW'),
      },
      { key: '/compensation', icon: <CreditCardOutlined />, label: <Link to="/compensation">Xodimlar maoshi</Link>, show: hasPermission('compensation', 'VIEW') },
      { key: '/payroll', icon: <AccountBookOutlined />, label: <Link to="/payroll">Ish haqi (Payroll)</Link>, show: hasPermission('payroll', 'VIEW') },
      { key: '/users', icon: <TeamOutlined />, label: <Link to="/users">Foydalanuvchilar</Link>, show: hasPermission('users', 'VIEW') },
      { key: '/roles', icon: <SafetyCertificateOutlined />, label: <Link to="/roles">Rollar</Link>, show: hasPermission('roles', 'VIEW') },
      { key: '/notifications', icon: <BellOutlined />, label: <Link to="/notifications">Bildirishnomalar</Link>, show: true },
      { key: '/audit-log', icon: <AuditOutlined />, label: <Link to="/audit-log">Audit jurnali</Link>, show: hasPermission('audit_logs', 'VIEW') },
      { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">Sozlamalar</Link>, show: hasPermission('settings', 'VIEW') },
    ];
    // antd's Menu spreads unknown item fields onto the DOM, so `show` must
    // not survive into the array actually passed to <Menu items={...}>.
    return candidates.filter((item) => item.show).map(({ key, icon, label }) => ({ key, icon, label }));
  }, [hasPermission]);

  // `/finance/*` has two-segment menu keys (e.g. "/finance/accounts"); everything else is one segment.
  const pathParts = location.pathname.split('/');
  const selectedMenuKey = pathParts[1] === 'finance' ? `/${pathParts[1]}/${pathParts[2] ?? ''}` : `/${pathParts[1] ?? ''}`;

  async function handleLogout() {
    await logout().catch(() => undefined);
    clear();
    navigate('/login', { replace: true });
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0">
        <div style={{ color: '#fff', textAlign: 'center', padding: '16px 0', fontWeight: 600, fontSize: 18 }}>ERP</div>
        <Menu theme="dark" mode="inline" selectedKeys={[selectedMenuKey]} items={menuItems} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          <NotificationBell />
          <Dropdown
            menu={{
              items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Chiqish', onClick: handleLogout }],
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar>{user?.fullName?.charAt(0)}</Avatar>
              <Typography.Text>{user?.fullName}</Typography.Text>
              <Typography.Text type="secondary">({user?.role})</Typography.Text>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
