import {
  AppstoreOutlined,
  AuditOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FileTextOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  TeamOutlined,
  TruckOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Dropdown, Layout, Menu, Space, Typography } from 'antd';
import { useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { useAuthStore } from '../store/auth.store';

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
      { key: '/customers', icon: <UserOutlined />, label: <Link to="/customers">Mijozlar</Link>, show: hasPermission('customers', 'VIEW') },
      { key: '/orders', icon: <ShoppingOutlined />, label: <Link to="/orders">Sotuvlar</Link>, show: hasPermission('orders', 'VIEW') },
      { key: '/invoices', icon: <FileTextOutlined />, label: <Link to="/invoices">Hisob-fakturalar</Link>, show: hasPermission('invoices', 'VIEW') },
      { key: '/payments', icon: <DollarOutlined />, label: <Link to="/payments">To'lovlar</Link>, show: hasPermission('payments', 'VIEW') },
      { key: '/products', icon: <AppstoreOutlined />, label: <Link to="/products">Mahsulotlar</Link>, show: hasPermission('products', 'VIEW') },
      { key: '/inventory', icon: <DatabaseOutlined />, label: <Link to="/inventory">Ombor</Link>, show: hasPermission('inventory', 'VIEW') },
      { key: '/warehouses', icon: <ShopOutlined />, label: <Link to="/warehouses">Omborlar</Link>, show: hasPermission('inventory', 'VIEW') },
      { key: '/suppliers', icon: <TruckOutlined />, label: <Link to="/suppliers">Yetkazib beruvchilar</Link>, show: hasPermission('suppliers', 'VIEW') },
      { key: '/purchases', icon: <ShoppingCartOutlined />, label: <Link to="/purchases">Xaridlar</Link>, show: hasPermission('purchases', 'VIEW') },
      { key: '/users', icon: <TeamOutlined />, label: <Link to="/users">Foydalanuvchilar</Link>, show: hasPermission('users', 'VIEW') },
      { key: '/roles', icon: <SafetyCertificateOutlined />, label: <Link to="/roles">Rollar</Link>, show: hasPermission('roles', 'VIEW') },
      { key: '/audit-log', icon: <AuditOutlined />, label: <Link to="/audit-log">Audit jurnali</Link>, show: hasPermission('audit_logs', 'VIEW') },
      { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">Sozlamalar</Link>, show: hasPermission('settings', 'VIEW') },
    ];
    // antd's Menu spreads unknown item fields onto the DOM, so `show` must
    // not survive into the array actually passed to <Menu items={...}>.
    return candidates.filter((item) => item.show).map(({ key, icon, label }) => ({ key, icon, label }));
  }, [hasPermission]);

  async function handleLogout() {
    await logout().catch(() => undefined);
    clear();
    navigate('/login', { replace: true });
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0">
        <div style={{ color: '#fff', textAlign: 'center', padding: '16px 0', fontWeight: 600, fontSize: 18 }}>ERP</div>
        <Menu theme="dark" mode="inline" selectedKeys={[`/${location.pathname.split('/')[1] ?? ''}`]} items={menuItems} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
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
