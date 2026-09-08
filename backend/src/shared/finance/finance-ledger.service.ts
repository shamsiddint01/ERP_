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
}
