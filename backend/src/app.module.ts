import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
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
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
