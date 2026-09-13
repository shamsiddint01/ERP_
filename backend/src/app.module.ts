import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter.js';
import { HttpLoggerInterceptor } from './shared/interceptors/http-logger.interceptor.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { AuditRegistryModule } from './shared/audit/audit-registry.module.js';
import { RolePermissionsCacheModule } from './shared/rbac/role-permissions-cache.module.js';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './shared/guards/permissions.guard.js';
import { AuditInterceptor } from './shared/interceptors/audit.interceptor.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { RbacModule } from './modules/rbac/rbac.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { AuditLogModule } from './modules/audit-log/audit-log.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';
import { PurchasesModule } from './modules/purchases/purchases.module.js';
import { FinanceLedgerModule } from './shared/finance/finance.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { InvoicesModule } from './modules/invoices/invoices.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { ExpensesModule } from './modules/expenses/expenses.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { DepartmentsModule } from './modules/departments/departments.module.js';
import { PositionsModule } from './modules/positions/positions.module.js';
import { EmployeesModule } from './modules/employees/employees.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { CompensationModule } from './modules/compensation/compensation.module.js';
import { PayrollModule } from './modules/payroll/payroll.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { StudentsModule } from './modules/students/students.module.js';
import { GuardiansModule } from './modules/guardians/guardians.module.js';
import { LeadsModule } from './modules/leads/leads.module.js';
import { CourseCategoriesModule } from './modules/course-categories/course-categories.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { BranchesModule } from './modules/branches/branches.module.js';
import { ClassroomsModule } from './modules/classrooms/classrooms.module.js';
import { GroupsModule } from './modules/groups/groups.module.js';
import { TeachersModule } from './modules/teachers/teachers.module.js';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module.js';
import { SchedulesModule } from './modules/schedules/schedules.module.js';
import { LessonsModule } from './modules/lessons/lessons.module.js';
import { StudentAttendanceModule } from './modules/student-attendance/student-attendance.module.js';
import { TuitionModule } from './modules/tuition/tuition.module.js';
import { DiscountsModule } from './modules/discounts/discounts.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Global abuse guard, per client IP. Headroom for a data-heavy SPA session
    // (a page can fire several calls); auth endpoints add their own tighter
    // limits (see AuthController). Behind a proxy, set TRUST_PROXY so the real
    // client IP is used.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    RedisModule,
    AuditRegistryModule,
    RolePermissionsCacheModule,
    AuthModule,
    UsersModule,
    RbacModule,
    SettingsModule,
    AuditLogModule,
    CustomersModule,
    ProductsModule,
    InventoryModule,
    DashboardModule,
    SuppliersModule,
    PurchasesModule,
    FinanceLedgerModule,
    OrdersModule,
    InvoicesModule,
    PaymentsModule,
    AccountsModule,
    ExpensesModule,
    ReportsModule,
    DepartmentsModule,
    PositionsModule,
    EmployeesModule,
    AttendanceModule,
    CompensationModule,
    PayrollModule,
    NotificationsModule,
    HealthModule,
    StudentsModule,
    GuardiansModule,
    LeadsModule,
    CourseCategoriesModule,
    CoursesModule,
    BranchesModule,
    ClassroomsModule,
    GroupsModule,
    TeachersModule,
    EnrollmentsModule,
    SchedulesModule,
    LessonsModule,
    StudentAttendanceModule,
    TuitionModule,
    DiscountsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpLoggerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
