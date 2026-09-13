import { Injectable, NotFoundException } from '@nestjs/common';
import type { Account, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ACCOUNT_CODES } from './account-codes.constant.js';
import { JournalService, type JournalEntryWithLines } from './journal.service.js';

type TransactionClient = Prisma.TransactionClient;

/** Physical cash in hand posts to the Cash account; every other payment method posts to Bank. */
function cashOrBankCode(method: PaymentMethod): string {
  return method === 'CASH' ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK;
}

/**
 * The semantic accounting layer business modules talk to. Each method
 * resolves the well-known Chart of Accounts leaves (seeded in prisma/seed.ts)
 * by code and hands a balanced set of debit/credit lines to JournalService —
 * this is the only place in the codebase that knows which accounts a given
 * business event touches, so Orders/Payments/Purchases/Expenses never
 * reference an Account id directly.
 */
@Injectable()
export class FinanceLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
  ) {}

  private async accountByCode(code: string, tx: TransactionClient): Promise<Account> {
    const account = await tx.account.findUnique({ where: { code } });
    if (!account) throw new NotFoundException(`Chart of Accounts is missing well-known account ${code} — re-run the seed`);
    return account;
  }

  /** Exposed so callers that need to stamp the resolved account onto their own record (e.g. Expense.paymentAccountId) can look it up without duplicating the Cash-vs-Bank rule. */
  async resolveCashOrBankAccount(method: PaymentMethod, tx: TransactionClient): Promise<Account> {
    return this.accountByCode(cashOrBankCode(method), tx);
  }

  /** Sale recognized at order completion: Dr Accounts Receivable / Cr Sales Revenue. */
  async recordSale(
    params: { amount: number; orderId: string; orderNumber: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordSale(params, trx));
    const [ar, revenue] = await Promise.all([
      this.accountByCode(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, tx),
      this.accountByCode(ACCOUNT_CODES.SALES_REVENUE, tx),
    ]);
    return this.journal.postEntry(
      {
        description: `Sale revenue for order ${params.orderNumber}`,
        referenceType: 'ORDER',
        referenceId: params.orderId,
        createdByUserId: params.createdByUserId,
        lines: [
          { accountId: ar.id, debit: params.amount },
          { accountId: revenue.id, credit: params.amount },
        ],
      },
      tx,
    );
  }

  /**
   * Tuition billed (Phase G): revenue is recognized the moment a
   * TuitionCharge is created, exactly like recordSale recognizes an Order's
   * revenue at completion — Dr Accounts Receivable / Cr Tuition Revenue for
   * the charge's netAmount (after any discount, which is why this posts the
   * already-discounted figure, not the gross amount).
   */
  async recordTuitionCharge(
    params: { netAmount: number; chargeId: string; studentName: string; billingPeriod: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordTuitionCharge(params, trx));
    const [ar, tuitionRevenue] = await Promise.all([
      this.accountByCode(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, tx),
      this.accountByCode(ACCOUNT_CODES.TUITION_REVENUE, tx),
    ]);
    return this.journal.postEntry(
      {
        description: `Tuition billed to ${params.studentName} for ${params.billingPeriod}`,
        referenceType: 'TUITION_CHARGE',
        referenceId: params.chargeId,
        createdByUserId: params.createdByUserId,
        lines: [
          { accountId: ar.id, debit: params.netAmount },
          { accountId: tuitionRevenue.id, credit: params.netAmount },
        ],
      },
      tx,
    );
  }

  /** Reverses a previously-billed, never-paid tuition charge on cancellation: Dr Tuition Revenue / Cr Accounts Receivable (exact inverse of recordTuitionCharge). */
  async recordTuitionChargeCancellation(
    params: { netAmount: number; chargeId: string; studentName: string; billingPeriod: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordTuitionChargeCancellation(params, trx));
    const [tuitionRevenue, ar] = await Promise.all([
      this.accountByCode(ACCOUNT_CODES.TUITION_REVENUE, tx),
      this.accountByCode(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, tx),
    ]);
    return this.journal.postEntry(
      {
        description: `Tuition charge for ${params.studentName} (${params.billingPeriod}) cancelled`,
        referenceType: 'TUITION_CHARGE',
        referenceId: params.chargeId,
        createdByUserId: params.createdByUserId,
        lines: [
          { accountId: tuitionRevenue.id, debit: params.netAmount },
          { accountId: ar.id, credit: params.netAmount },
        ],
      },
      tx,
    );
  }

  /** Money received from a customer: Dr Cash/Bank / Cr Accounts Receivable. */
  async recordCustomerPayment(
    params: { amount: number; method: PaymentMethod; paymentId: string; paymentNumber: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordCustomerPayment(params, trx));
    const [cashOrBank, ar] = await Promise.all([
      this.accountByCode(cashOrBankCode(params.method), tx),
      this.accountByCode(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, tx),
    ]);
    return this.journal.postEntry(
      {
        description: `Payment ${params.paymentNumber} received via ${params.method}`,
        referenceType: 'PAYMENT',
        referenceId: params.paymentId,
        createdByUserId: params.createdByUserId,
        lines: [
          { accountId: cashOrBank.id, debit: params.amount },
          { accountId: ar.id, credit: params.amount },
        ],
      },
      tx,
    );
  }

  /** Money paid out to a supplier: Dr Accounts Payable / Cr Cash/Bank. */
  async recordSupplierPayment(
    params: { amount: number; method: PaymentMethod; paymentId: string; paymentNumber: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordSupplierPayment(params, trx));
    const [ap, cashOrBank] = await Promise.all([
      this.accountByCode(ACCOUNT_CODES.ACCOUNTS_PAYABLE, tx),
      this.accountByCode(cashOrBankCode(params.method), tx),
    ]);
    return this.journal.postEntry(
      {
        description: `Payment ${params.paymentNumber} sent via ${params.method}`,
        referenceType: 'PAYMENT',
        referenceId: params.paymentId,
        createdByUserId: params.createdByUserId,
        lines: [
          { accountId: ap.id, debit: params.amount },
          { accountId: cashOrBank.id, credit: params.amount },
        ],
      },
      tx,
    );
  }

  /** Reverses a previously-recorded customer payment: Dr Accounts Receivable / Cr Cash/Bank. */
  async recordCustomerRefund(
    params: { amount: number; method: PaymentMethod; paymentId: string; paymentNumber: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordCustomerRefund(params, trx));
    const [ar, cashOrBank] = await Promise.all([
      this.accountByCode(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, tx),
      this.accountByCode(cashOrBankCode(params.method), tx),
    ]);
    return this.journal.postEntry(
      {
        description: `Refund for payment ${params.paymentNumber}`,
        referenceType: 'PAYMENT',
        referenceId: params.paymentId,
        createdByUserId: params.createdByUserId,
        lines: [
          { accountId: ar.id, debit: params.amount },
          { accountId: cashOrBank.id, credit: params.amount },
        ],
      },
      tx,
    );
  }

  /** Reverses a previously-recorded supplier payment: Dr Cash/Bank / Cr Accounts Payable. */
  async recordSupplierRefund(
    params: { amount: number; method: PaymentMethod; paymentId: string; paymentNumber: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordSupplierRefund(params, trx));
    const [cashOrBank, ap] = await Promise.all([
      this.accountByCode(cashOrBankCode(params.method), tx),
      this.accountByCode(ACCOUNT_CODES.ACCOUNTS_PAYABLE, tx),
    ]);
    return this.journal.postEntry(
      {
        description: `Refund reversal for payment ${params.paymentNumber}`,
        referenceType: 'PAYMENT',
        referenceId: params.paymentId,
        createdByUserId: params.createdByUserId,
        lines: [
          { accountId: cashOrBank.id, debit: params.amount },
          { accountId: ap.id, credit: params.amount },
        ],
      },
      tx,
    );
  }

  /** Goods received into stock: Dr Inventory / Cr Accounts Payable. */
  async recordPurchaseReceipt(
    params: { amount: number; poId: string; poNumber: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordPurchaseReceipt(params, trx));
    const [inventory, ap] = await Promise.all([
      this.accountByCode(ACCOUNT_CODES.INVENTORY, tx),
      this.accountByCode(ACCOUNT_CODES.ACCOUNTS_PAYABLE, tx),
    ]);
    return this.journal.postEntry(
      {
        description: `Goods received for purchase order ${params.poNumber}`,
        referenceType: 'PURCHASE_ORDER',
        referenceId: params.poId,
        createdByUserId: params.createdByUserId,
        lines: [
          { accountId: inventory.id, debit: params.amount },
          { accountId: ap.id, credit: params.amount },
        ],
      },
      tx,
    );
  }

  /** Expense approved: the liability is recognized but cash is not yet touched — Dr Expense account / Cr Accounts Payable. */
  async recordExpenseApproval(
    params: { amount: number; expenseId: string; expenseNumber: string; expenseAccountId: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordExpenseApproval(params, trx));
    const ap = await this.accountByCode(ACCOUNT_CODES.ACCOUNTS_PAYABLE, tx);
    return this.journal.postEntry(
      {
        description: `Expense ${params.expenseNumber} approved`,
        referenceType: 'EXPENSE',
        referenceId: params.expenseId,
        createdByUserId: params.createdByUserId,
        lines: [
          { accountId: params.expenseAccountId, debit: params.amount },
          { accountId: ap.id, credit: params.amount },
        ],
      },
      tx,
    );
  }

  /** Reverses a previously-approved but not-yet-paid expense (e.g. cancelled post-approval): Dr Accounts Payable / Cr Expense account. */
  async recordExpenseApprovalReversal(
    params: { amount: number; expenseId: string; expenseNumber: string; expenseAccountId: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordExpenseApprovalReversal(params, trx));
    const ap = await this.accountByCode(ACCOUNT_CODES.ACCOUNTS_PAYABLE, tx);
    return this.journal.postEntry(
      {
        description: `Expense ${params.expenseNumber} approval reversed (cancelled)`,
        referenceType: 'EXPENSE',
        referenceId: params.expenseId,
        createdByUserId: params.createdByUserId,
        lines: [
          { accountId: ap.id, debit: params.amount },
          { accountId: params.expenseAccountId, credit: params.amount },
        ],
      },
      tx,
    );
  }

  /** Expense paid: clears the payable — Dr Accounts Payable / Cr Cash/Bank. */
  async recordExpensePayment(
    params: { amount: number; method: PaymentMethod; expenseId: string; expenseNumber: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordExpensePayment(params, trx));
    const [ap, cashOrBank] = await Promise.all([
      this.accountByCode(ACCOUNT_CODES.ACCOUNTS_PAYABLE, tx),
      this.accountByCode(cashOrBankCode(params.method), tx),
    ]);
    return this.journal.postEntry(
      {
        description: `Expense ${params.expenseNumber} paid via ${params.method}`,
        referenceType: 'EXPENSE',
        referenceId: params.expenseId,
        createdByUserId: params.createdByUserId,
        lines: [
          { accountId: ap.id, debit: params.amount },
          { accountId: cashOrBank.id, credit: params.amount },
        ],
      },
      tx,
    );
  }

  /**
   * Payroll approved: the company's payroll cost is recognized. Dr Salary
   * Expense for the full gross amount / Cr Payroll Payable for the net amount
   * owed to the employee / Cr Deductions Payable for anything withheld
   * (taxes, etc. — only included when deductionAmount > 0, since a zero-
   * amount journal line is rejected by JournalService).
   */
  async recordPayrollApproval(
    params: { grossSalary: number; netSalary: number; deductionAmount: number; payrollId: string; payrollNumber: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordPayrollApproval(params, trx));
    const [salaryExpense, payrollPayable] = await Promise.all([
      this.accountByCode(ACCOUNT_CODES.SALARIES_EXPENSE, tx),
      this.accountByCode(ACCOUNT_CODES.PAYROLL_PAYABLE, tx),
    ]);
    const lines = [
      { accountId: salaryExpense.id, debit: params.grossSalary },
      { accountId: payrollPayable.id, credit: params.netSalary },
    ];
    if (params.deductionAmount > 0) {
      const deductionsPayable = await this.accountByCode(ACCOUNT_CODES.DEDUCTIONS_PAYABLE, tx);
      lines.push({ accountId: deductionsPayable.id, credit: params.deductionAmount });
    }
    return this.journal.postEntry(
      {
        description: `Payroll ${params.payrollNumber} approved`,
        referenceType: 'PAYROLL',
        referenceId: params.payrollId,
        createdByUserId: params.createdByUserId,
        lines,
      },
      tx,
    );
  }

  /** Reverses a previously-approved but not-yet-paid payroll (e.g. cancelled post-approval) — exact inverse of recordPayrollApproval. */
  async recordPayrollApprovalReversal(
    params: { grossSalary: number; netSalary: number; deductionAmount: number; payrollId: string; payrollNumber: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordPayrollApprovalReversal(params, trx));
    const [salaryExpense, payrollPayable] = await Promise.all([
      this.accountByCode(ACCOUNT_CODES.SALARIES_EXPENSE, tx),
      this.accountByCode(ACCOUNT_CODES.PAYROLL_PAYABLE, tx),
    ]);
    const lines = [
      { accountId: payrollPayable.id, debit: params.netSalary },
      { accountId: salaryExpense.id, credit: params.grossSalary },
    ];
    if (params.deductionAmount > 0) {
      const deductionsPayable = await this.accountByCode(ACCOUNT_CODES.DEDUCTIONS_PAYABLE, tx);
      lines.push({ accountId: deductionsPayable.id, debit: params.deductionAmount });
    }
    return this.journal.postEntry(
      {
        description: `Payroll ${params.payrollNumber} approval reversed (cancelled)`,
        referenceType: 'PAYROLL',
        referenceId: params.payrollId,
        createdByUserId: params.createdByUserId,
        lines,
      },
      tx,
    );
  }

  /** Payroll paid out: clears the payable — Dr Payroll Payable / Cr Cash/Bank. */
  async recordPayrollPayment(
    params: { netSalary: number; method: PaymentMethod; payrollId: string; payrollNumber: string; createdByUserId: string },
    tx?: TransactionClient,
  ): Promise<JournalEntryWithLines> {
    if (!tx) return this.prisma.$transaction((trx) => this.recordPayrollPayment(params, trx));
    const [payrollPayable, cashOrBank] = await Promise.all([
      this.accountByCode(ACCOUNT_CODES.PAYROLL_PAYABLE, tx),
      this.accountByCode(cashOrBankCode(params.method), tx),
    ]);
    return this.journal.postEntry(
      {
        description: `Payroll ${params.payrollNumber} paid via ${params.method}`,
        referenceType: 'PAYROLL',
        referenceId: params.payrollId,
        createdByUserId: params.createdByUserId,
        lines: [
          { accountId: payrollPayable.id, debit: params.netSalary },
          { accountId: cashOrBank.id, credit: params.netSalary },
        ],
      },
      tx,
    );
  }
}
