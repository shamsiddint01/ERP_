import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';
import { AttendancePage } from './pages/attendance/AttendancePage';
import { AuditLogPage } from './pages/AuditLogPage';
import { BranchDetailPage } from './pages/branches/BranchDetailPage';
import { BranchesPage } from './pages/branches/BranchesPage';
import { ClassroomDetailPage } from './pages/classrooms/ClassroomDetailPage';
import { ClassroomsPage } from './pages/classrooms/ClassroomsPage';
import { CompensationPage } from './pages/compensation/CompensationPage';
import { CourseCategoriesPage } from './pages/course-categories/CourseCategoriesPage';
import { CourseDetailPage } from './pages/courses/CourseDetailPage';
import { CoursesPage } from './pages/courses/CoursesPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { DepartmentDetailPage } from './pages/departments/DepartmentDetailPage';
import { DepartmentsPage } from './pages/departments/DepartmentsPage';
import { EmployeeDetailPage } from './pages/employees/EmployeeDetailPage';
import { EmployeesPage } from './pages/employees/EmployeesPage';
import { EnrollmentDetailPage } from './pages/enrollments/EnrollmentDetailPage';
import { EnrollmentsPage } from './pages/enrollments/EnrollmentsPage';
import { ExpensesPage } from './pages/expenses/ExpensesPage';
import { AccountsPage } from './pages/finance/AccountsPage';
import { ReportsPage } from './pages/finance/ReportsPage';
import { GroupDetailPage } from './pages/groups/GroupDetailPage';
import { GroupsPage } from './pages/groups/GroupsPage';
import { GuardianDetailPage } from './pages/guardians/GuardianDetailPage';
import { GuardiansPage } from './pages/guardians/GuardiansPage';
import { InventoryPage } from './pages/inventory/InventoryPage';
import { WarehousesPage } from './pages/inventory/WarehousesPage';
import { InvoicesPage } from './pages/invoices/InvoicesPage';
import { LeadDetailPage } from './pages/leads/LeadDetailPage';
import { LeadsPage } from './pages/leads/LeadsPage';
import { LessonDetailPage } from './pages/lessons/LessonDetailPage';
import { LessonsPage } from './pages/lessons/LessonsPage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { OrderDetailPage } from './pages/orders/OrderDetailPage';
import { OrdersPage } from './pages/orders/OrdersPage';
import { PaymentsPage } from './pages/payments/PaymentsPage';
import { PayrollDetailPage } from './pages/payroll/PayrollDetailPage';
import { PayrollPeriodDetailPage } from './pages/payroll/PayrollPeriodDetailPage';
import { PayrollPeriodsPage } from './pages/payroll/PayrollPeriodsPage';
import { PayrollReportsPage } from './pages/payroll/PayrollReportsPage';
import { ProductsPage } from './pages/products/ProductsPage';
import { PurchaseOrderDetailPage } from './pages/purchases/PurchaseOrderDetailPage';
import { PurchasesPage } from './pages/purchases/PurchasesPage';
import { PositionsPage } from './pages/positions/PositionsPage';
import { RolesPage } from './pages/RolesPage';
import { ScheduleCalendarPage } from './pages/schedules/ScheduleCalendarPage';
import { SchedulesPage } from './pages/schedules/SchedulesPage';
import { SettingsPage } from './pages/SettingsPage';
import { StudentDetailPage } from './pages/students/StudentDetailPage';
import { StudentsPage } from './pages/students/StudentsPage';
import { SupplierDetailPage } from './pages/suppliers/SupplierDetailPage';
import { SuppliersPage } from './pages/suppliers/SuppliersPage';
import { TeacherDetailPage } from './pages/teachers/TeacherDetailPage';
import { TeachersPage } from './pages/teachers/TeachersPage';
import { UsersPage } from './pages/UsersPage';

export default function App() {
  useAuthBootstrap();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/:id" element={<StudentDetailPage />} />
          <Route path="/guardians" element={<GuardiansPage />} />
          <Route path="/guardians/:id" element={<GuardianDetailPage />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/leads/:id" element={<LeadDetailPage />} />
          <Route path="/course-categories" element={<CourseCategoriesPage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/:id" element={<CourseDetailPage />} />
          <Route path="/branches" element={<BranchesPage />} />
          <Route path="/branches/:id" element={<BranchDetailPage />} />
          <Route path="/classrooms" element={<ClassroomsPage />} />
          <Route path="/classrooms/:id" element={<ClassroomDetailPage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:id" element={<GroupDetailPage />} />
          <Route path="/enrollments" element={<EnrollmentsPage />} />
          <Route path="/enrollments/:id" element={<EnrollmentDetailPage />} />
          <Route path="/schedules" element={<SchedulesPage />} />
          <Route path="/schedules/calendar" element={<ScheduleCalendarPage />} />
          <Route path="/lessons" element={<LessonsPage />} />
          <Route path="/lessons/:id" element={<LessonDetailPage />} />
          <Route path="/teachers" element={<TeachersPage />} />
          <Route path="/teachers/:id" element={<TeacherDetailPage />} />
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
          <Route path="/departments" element={<DepartmentsPage />} />
          <Route path="/departments/:id" element={<DepartmentDetailPage />} />
          <Route path="/positions" element={<PositionsPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/employees/:id" element={<EmployeeDetailPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/compensation" element={<CompensationPage />} />
          <Route path="/payroll" element={<PayrollPeriodsPage />} />
          <Route path="/payroll/reports" element={<PayrollReportsPage />} />
          <Route path="/payroll/periods/:id" element={<PayrollPeriodDetailPage />} />
          <Route path="/payroll/:id" element={<PayrollDetailPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/roles" element={<RolesPage />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
