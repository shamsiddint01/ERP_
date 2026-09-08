import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';
import { AuditLogPage } from './pages/AuditLogPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExpensesPage } from './pages/expenses/ExpensesPage';
import { AccountsPage } from './pages/finance/AccountsPage';
import { ReportsPage } from './pages/finance/ReportsPage';
import { InventoryPage } from './pages/inventory/InventoryPage';
import { WarehousesPage } from './pages/inventory/WarehousesPage';
import { InvoicesPage } from './pages/invoices/InvoicesPage';
import { LoginPage } from './pages/LoginPage';
import { OrderDetailPage } from './pages/orders/OrderDetailPage';
import { OrdersPage } from './pages/orders/OrdersPage';
import { PaymentsPage } from './pages/payments/PaymentsPage';
import { ProductsPage } from './pages/products/ProductsPage';
import { PurchaseOrderDetailPage } from './pages/purchases/PurchaseOrderDetailPage';
import { PurchasesPage } from './pages/purchases/PurchasesPage';
import { RolesPage } from './pages/RolesPage';
import { SettingsPage } from './pages/SettingsPage';
import { SupplierDetailPage } from './pages/suppliers/SupplierDetailPage';
import { SuppliersPage } from './pages/suppliers/SuppliersPage';
import { UsersPage } from './pages/UsersPage';

export default function App() {
  useAuthBootstrap();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/warehouses" element={<WarehousesPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/purchases/:id" element={<PurchaseOrderDetailPage />} />
          <Route path="/finance/accounts" element={<AccountsPage />} />
          <Route path="/finance/reports" element={<ReportsPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/roles" element={<RolesPage />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
