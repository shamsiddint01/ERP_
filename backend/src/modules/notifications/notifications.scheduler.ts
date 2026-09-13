import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { computeStockStatus } from '../../shared/inventory/stock-status.util.js';
import { NotificationsService } from './notifications.service.js';

export interface ScanSummary {
  lowStock: number;
  overdueInvoices: number;
  pendingExpenses: number;
  pendingPayrolls: number;
  tuitionDue: number;
  overdueTuition: number;
}

/** Tuition due within this many days triggers a reminder (once — dedupe keeps it from repeating every day until read). */
const TUITION_DUE_REMINDER_DAYS = 3;

/**
 * Daily backstop for the notifications that aren't tied to a single state
 * transition. Immediate events (expense submitted, payroll calculated,
 * attendance flagged) are notified inline by their own services; this catches
 * the time-based ones (an invoice quietly going overdue) and anything the
 * inline path missed. Every write goes through NotificationsService.notify()
 * with dedupe on, so running twice in a day is harmless.
 */
@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async handleDailyScans() {
    const summary = await this.runDailyScans();
    this.logger.log(
      `Daily notification scan: ${summary.lowStock} low-stock, ${summary.overdueInvoices} overdue invoices, ` +
        `${summary.pendingExpenses} pending expenses, ${summary.pendingPayrolls} pending payrolls, ` +
        `${summary.tuitionDue} tuition due soon, ${summary.overdueTuition} overdue tuition`,
    );
  }

  async runDailyScans(): Promise<ScanSummary> {
    const [lowStock, overdueInvoices, pendingExpenses, pendingPayrolls, tuitionDue, overdueTuition] = await Promise.all([
      this.scanLowStock(),
      this.scanOverdueInvoices(),
      this.scanPendingExpenses(),
      this.scanPendingPayrolls(),
      this.scanTuitionDue(),
      this.scanOverdueTuition(),
    ]);
    return { lowStock, overdueInvoices, pendingExpenses, pendingPayrolls, tuitionDue, overdueTuition };
  }

  /** Products at or below their minimum stock level in any warehouse. */
  private async scanLowStock(): Promise<number> {
    const stocks = await this.prisma.inventoryStock.findMany({
      include: {
        product: { select: { id: true, name: true, sku: true, minStockLevel: true, deletedAt: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    let notified = 0;
    for (const stock of stocks) {
      if (stock.product.deletedAt) continue;
      const minLevel = Number(stock.minStockLevel ?? stock.product.minStockLevel);
      const status = computeStockStatus(Number(stock.quantityOnHand), minLevel);
      if (status !== 'LOW_STOCK' && status !== 'OUT_OF_STOCK') continue;

      notified += await this.notifications.notifyByPermission('inventory', 'VIEW', {
        type: 'LOW_STOCK',
        severity: status === 'OUT_OF_STOCK' ? 'CRITICAL' : 'WARNING',
        title: status === 'OUT_OF_STOCK' ? 'Mahsulot tugadi' : 'Kam qolgan mahsulot',
        message: `${stock.product.name} (${stock.product.sku}) — ${stock.warehouse.name} omborida ${Number(stock.quantityOnHand)} dona qoldi (minimal: ${minLevel}).`,
        referenceType: 'Product',
        referenceId: stock.product.id,
        actionUrl: '/inventory',
      });
    }
    return notified;
  }

  /** Sent/partially-paid invoices past their due date — flips status to OVERDUE and notifies. */
  private async scanOverdueInvoices(): Promise<number> {
    const now = new Date();
    const invoices = await this.prisma.invoice.findMany({
      where: { dueDate: { lt: now }, status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
      select: { id: true, invoiceNumber: true, dueDate: true, grandTotal: true, amountPaid: true, status: true, customer: { select: { name: true } } },
    });

    let notified = 0;
    for (const invoice of invoices) {
      if (invoice.status !== 'OVERDUE') {
        await this.prisma.invoice.updateMany({ where: { id: invoice.id, status: invoice.status }, data: { status: 'OVERDUE' } });
      }
      const outstanding = Number(invoice.grandTotal) - Number(invoice.amountPaid);
      notified += await this.notifications.notifyByPermission('invoices', 'VIEW', {
        type: 'INVOICE_OVERDUE',
        severity: 'CRITICAL',
        title: 'Muddati o‘tgan hisob-faktura',
        message: `${invoice.invoiceNumber} (${invoice.customer.name}) — muddati ${invoice.dueDate.toISOString().slice(0, 10)}, to‘lanmagan qoldiq ${outstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
        referenceType: 'Invoice',
        referenceId: invoice.id,
        actionUrl: '/invoices',
      });
    }
    return notified;
  }

  /** PENDING expenses awaiting an approver's decision. */
  private async scanPendingExpenses(): Promise<number> {
    const expenses = await this.prisma.expense.findMany({
      where: { status: 'PENDING' },
      select: { id: true, expenseNumber: true, amount: true, category: { select: { name: true } } },
    });

    let notified = 0;
    for (const expense of expenses) {
      notified += await this.notifications.notifyByPermission('expenses', 'APPROVE', {
        type: 'EXPENSE_PENDING',
        title: 'Tasdiqlashni kutayotgan xarajat',
        message: `${expense.expenseNumber} — ${expense.category.name}, ${Number(expense.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} tasdiqlashni kutmoqda.`,
        referenceType: 'Expense',
        referenceId: expense.id,
        actionUrl: '/expenses',
      });
    }
    return notified;
  }

  /** CALCULATED payrolls awaiting approval. */
  private async scanPendingPayrolls(): Promise<number> {
    const payrolls = await this.prisma.payroll.findMany({
      where: { status: 'CALCULATED' },
      select: { id: true, payrollNumber: true, netSalary: true, employee: { select: { fullName: true } } },
    });

    let notified = 0;
    for (const payroll of payrolls) {
      notified += await this.notifications.notifyByPermission('payroll', 'APPROVE', {
        type: 'PAYROLL_PENDING',
        title: 'Tasdiqlashni kutayotgan ish haqi',
        message: `${payroll.payrollNumber} — ${payroll.employee.fullName}, sof ${Number(payroll.netSalary).toLocaleString('en-US', { minimumFractionDigits: 2 })} tasdiqlashni kutmoqda.`,
        referenceType: 'Payroll',
        referenceId: payroll.id,
        actionUrl: '/payroll',
      });
    }
    return notified;
  }

  /** PENDING/PARTIALLY_PAID tuition charges due within TUITION_DUE_REMINDER_DAYS — a one-time-per-charge reminder (dedupe: same recipient/type/referenceId, unread). */
  private async scanTuitionDue(): Promise<number> {
    const now = new Date();
    const horizon = new Date(now.getTime() + TUITION_DUE_REMINDER_DAYS * 24 * 60 * 60 * 1000);
    const charges = await this.prisma.tuitionCharge.findMany({
      where: { status: { in: ['PENDING', 'PARTIALLY_PAID'] }, dueDate: { gte: now, lte: horizon } },
      select: { id: true, billingPeriod: true, netAmount: true, dueDate: true, student: { select: { fullName: true } } },
    });

    let notified = 0;
    for (const charge of charges) {
      notified += await this.notifications.notifyByPermission('tuition', 'VIEW', {
        type: 'TUITION_DUE',
        title: "To'lov muddati yaqinlashmoqda",
        message: `${charge.student.fullName} — ${charge.billingPeriod} uchun ${Number(charge.netAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}, muddati ${charge.dueDate.toISOString().slice(0, 10)}.`,
        referenceType: 'TuitionCharge',
        referenceId: charge.id,
        actionUrl: '/tuition',
      });
    }
    return notified;
  }

  /** PENDING/PARTIALLY_PAID/OVERDUE tuition charges past their due date — flips status to OVERDUE and notifies (mirrors scanOverdueInvoices exactly). */
  private async scanOverdueTuition(): Promise<number> {
    const now = new Date();
    const charges = await this.prisma.tuitionCharge.findMany({
      where: { dueDate: { lt: now }, status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] } },
      select: { id: true, billingPeriod: true, netAmount: true, dueDate: true, status: true, student: { select: { fullName: true } } },
    });

    let notified = 0;
    for (const charge of charges) {
      if (charge.status !== 'OVERDUE') {
        await this.prisma.tuitionCharge.updateMany({ where: { id: charge.id, status: charge.status }, data: { status: 'OVERDUE' } });
      }
      notified += await this.notifications.notifyByPermission('tuition', 'VIEW', {
        type: 'TUITION_OVERDUE',
        severity: 'CRITICAL',
        title: "Muddati o'tgan to'lov",
        message: `${charge.student.fullName} — ${charge.billingPeriod} uchun ${Number(charge.netAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}, muddati ${charge.dueDate.toISOString().slice(0, 10)} edi.`,
        referenceType: 'TuitionCharge',
        referenceId: charge.id,
        actionUrl: '/tuition',
      });
    }
    return notified;
  }
}
