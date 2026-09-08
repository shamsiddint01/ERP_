import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ACCOUNT_CODES } from '../../shared/finance/account-codes.constant.js';
import { InventoryService } from '../inventory/inventory.service.js';

const PENDING_ORDER_STATUSES = ['DRAFT', 'CONFIRMED', 'PROCESSING'] as const;
const OUTSTANDING_INVOICE_STATUSES = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async getOverview() {
    const [
      customersCount,
      productsCount,
      suppliersCount,
      pendingPurchaseOrdersCount,
      inventorySummary,
      revenueAggregate,
      ordersCount,
      pendingOrdersCount,
      outstandingInvoices,
      paidInvoicesCount,
    ] = await Promise.all([
      this.prisma.customer.count({ where: { deletedAt: null } }),
      this.prisma.product.count({ where: { deletedAt: null } }),
      this.prisma.supplier.count({ where: { deletedAt: null } }),
      this.prisma.purchaseOrder.count({ where: { status: { in: ['PENDING', 'APPROVED'] } } }),
      this.inventoryService.getSummary(),
      this.prisma.order.aggregate({ where: { status: 'COMPLETED' }, _sum: { grandTotal: true } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: { in: [...PENDING_ORDER_STATUSES] } } }),
      this.prisma.invoice.findMany({
        where: { status: { in: [...OUTSTANDING_INVOICE_STATUSES] } },
        select: { grandTotal: true, amountPaid: true },
      }),
      this.prisma.invoice.count({ where: { status: 'PAID' } }),
    ]);

    const outstandingPaymentsAmount = outstandingInvoices.reduce(
      (sum, invoice) => sum + (Number(invoice.grandTotal) - Number(invoice.amountPaid)),
      0,
    );

    const financeKpis = await this.getFinanceKpis();

    return {
      customersCount,
      productsCount,
      suppliersCount,
      pendingPurchaseOrdersCount,
      totalStockQuantity: inventorySummary.totalStockQuantity,
      lowStockCount: inventorySummary.lowStockCount,
      outOfStockCount: inventorySummary.outOfStockCount,
      recentMovements: inventorySummary.recentMovements,
      totalRevenue: Number(revenueAggregate._sum.grandTotal ?? 0),
      ordersCount,
      pendingOrdersCount,
      outstandingPaymentsAmount,
      paidInvoicesCount,
      finance: financeKpis,
    };
  }

  /** Real double-entry-derived KPIs — every figure comes from Account.currentBalance, never re-derived from Order/Invoice rows. */
  private async getFinanceKpis() {
    const accounts = await this.prisma.account.findMany({
      where: { code: { in: [ACCOUNT_CODES.CASH, ACCOUNT_CODES.BANK, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, ACCOUNT_CODES.ACCOUNTS_PAYABLE, ACCOUNT_CODES.SALES_REVENUE] } },
    });
    const balanceByCode = new Map(accounts.map((a) => [a.code, Number(a.currentBalance)]));

    const expenseAccounts = await this.prisma.account.findMany({ where: { category: 'EXPENSE', isPostable: true } });
    const totalExpenses = expenseAccounts.reduce((sum, a) => sum + Number(a.currentBalance), 0);

    const totalRevenue = balanceByCode.get(ACCOUNT_CODES.SALES_REVENUE) ?? 0;
    const cash = balanceByCode.get(ACCOUNT_CODES.CASH) ?? 0;
    const bank = balanceByCode.get(ACCOUNT_CODES.BANK) ?? 0;

    return {
      cash,
      bank,
      totalCash: cash + bank,
      accountsReceivable: balanceByCode.get(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE) ?? 0,
      accountsPayable: balanceByCode.get(ACCOUNT_CODES.ACCOUNTS_PAYABLE) ?? 0,
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
    };
  }

  /** Daily completed-order revenue for the last `days` days — backs the Dashboard revenue chart. */
  async getRevenueChart(days = 14) {
    // Built entirely in UTC calendar days (Date.UTC + toISOString) so the
    // bucketing can't drift by a day depending on the server's local timezone.
    const todayUtc = new Date();
    const todayUtcMidnight = Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate());
    const sinceUtcMidnight = todayUtcMidnight - (days - 1) * 86_400_000;

    const orders = await this.prisma.order.findMany({
      where: { status: 'COMPLETED', completedAt: { gte: new Date(sinceUtcMidnight) } },
      select: { completedAt: true, grandTotal: true },
    });

    const byDay = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      byDay.set(new Date(sinceUtcMidnight + i * 86_400_000).toISOString().slice(0, 10), 0);
    }
    for (const order of orders) {
      if (!order.completedAt) continue;
      const key = order.completedAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + Number(order.grandTotal));
    }

    return Array.from(byDay.entries()).map(([date, revenue]) => ({ date, revenue }));
  }
}
