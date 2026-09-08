import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_CODES } from './account-codes.constant.js';
import { FinanceLedgerService } from './finance-ledger.service.js';

const ACCOUNTS_BY_CODE: Record<string, { id: string; code: string }> = {
  [ACCOUNT_CODES.CASH]: { id: 'cash-id', code: ACCOUNT_CODES.CASH },
  [ACCOUNT_CODES.BANK]: { id: 'bank-id', code: ACCOUNT_CODES.BANK },
  [ACCOUNT_CODES.ACCOUNTS_RECEIVABLE]: { id: 'ar-id', code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE },
  [ACCOUNT_CODES.ACCOUNTS_PAYABLE]: { id: 'ap-id', code: ACCOUNT_CODES.ACCOUNTS_PAYABLE },
  [ACCOUNT_CODES.INVENTORY]: { id: 'inv-id', code: ACCOUNT_CODES.INVENTORY },
  [ACCOUNT_CODES.SALES_REVENUE]: { id: 'rev-id', code: ACCOUNT_CODES.SALES_REVENUE },
};

function createPrismaMock() {
  const txStub = {
    account: { findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(ACCOUNTS_BY_CODE[where.code] ?? null)) },
  };
  return { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)), __tx: txStub };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  const journal = { postEntry: vi.fn().mockResolvedValue({ id: 'je1' }) };
  const service = new FinanceLedgerService(prisma as never, journal as never);
  return { service, journal };
}

describe('FinanceLedgerService', () => {
  it('recordSale posts Dr Accounts Receivable / Cr Sales Revenue', async () => {
    const prisma = createPrismaMock();
    const { service, journal } = createService(prisma);

    await service.recordSale({ amount: 6600, orderId: 'order1', orderNumber: 'ORD-1', createdByUserId: 'user1' }, prisma.__tx as never);

    expect(journal.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceType: 'ORDER',
        referenceId: 'order1',
        lines: [
          { accountId: 'ar-id', debit: 6600 },
          { accountId: 'rev-id', credit: 6600 },
        ],
      }),
      prisma.__tx,
    );
  });

  it('recordCustomerPayment posts to Cash for method CASH', async () => {
    const prisma = createPrismaMock();
    const { service, journal } = createService(prisma);

    await service.recordCustomerPayment(
      { amount: 4000, method: 'CASH', paymentId: 'pay1', paymentNumber: 'PAY-1', createdByUserId: 'user1' },
      prisma.__tx as never,
    );

    expect(journal.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [{ accountId: 'cash-id', debit: 4000 }, { accountId: 'ar-id', credit: 4000 }] }),
      prisma.__tx,
    );
  });

  it('recordCustomerPayment posts to Bank for method BANK_TRANSFER', async () => {
    const prisma = createPrismaMock();
    const { service, journal } = createService(prisma);

    await service.recordCustomerPayment(
      { amount: 2600, method: 'BANK_TRANSFER', paymentId: 'pay2', paymentNumber: 'PAY-2', createdByUserId: 'user1' },
      prisma.__tx as never,
    );

    expect(journal.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [{ accountId: 'bank-id', debit: 2600 }, { accountId: 'ar-id', credit: 2600 }] }),
      prisma.__tx,
    );
  });

  it('recordSupplierPayment posts Dr Accounts Payable / Cr Cash-or-Bank', async () => {
    const prisma = createPrismaMock();
    const { service, journal } = createService(prisma);

    await service.recordSupplierPayment(
      { amount: 19800, method: 'CASH', paymentId: 'pay3', paymentNumber: 'PAY-3', createdByUserId: 'user1' },
      prisma.__tx as never,
    );

    expect(journal.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [{ accountId: 'ap-id', debit: 19800 }, { accountId: 'cash-id', credit: 19800 }] }),
      prisma.__tx,
    );
  });

  it('recordPurchaseReceipt posts Dr Inventory / Cr Accounts Payable', async () => {
    const prisma = createPrismaMock();
    const { service, journal } = createService(prisma);

    await service.recordPurchaseReceipt({ amount: 19800, poId: 'po1', poNumber: 'PO-1', createdByUserId: 'user1' }, prisma.__tx as never);

    expect(journal.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceType: 'PURCHASE_ORDER',
        lines: [{ accountId: 'inv-id', debit: 19800 }, { accountId: 'ap-id', credit: 19800 }],
      }),
      prisma.__tx,
    );
  });

  it('recordExpenseApproval posts Dr Expense account / Cr Accounts Payable without touching Cash', async () => {
    const prisma = createPrismaMock();
    const { service, journal } = createService(prisma);

    await service.recordExpenseApproval(
      { amount: 500, expenseId: 'exp1', expenseNumber: 'EXP-1', expenseAccountId: 'rent-expense-id', createdByUserId: 'user1' },
      prisma.__tx as never,
    );

    expect(journal.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [{ accountId: 'rent-expense-id', debit: 500 }, { accountId: 'ap-id', credit: 500 }] }),
      prisma.__tx,
    );
  });

  it('recordExpensePayment clears the payable — Dr Accounts Payable / Cr Cash-or-Bank', async () => {
    const prisma = createPrismaMock();
    const { service, journal } = createService(prisma);

    await service.recordExpensePayment(
      { amount: 500, method: 'BANK_TRANSFER', expenseId: 'exp1', expenseNumber: 'EXP-1', createdByUserId: 'user1' },
      prisma.__tx as never,
    );

    expect(journal.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [{ accountId: 'ap-id', debit: 500 }, { accountId: 'bank-id', credit: 500 }] }),
      prisma.__tx,
    );
  });

  it('throws NotFoundException when a well-known account code is missing from the Chart of Accounts', async () => {
    const prisma = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({ account: { findUnique: vi.fn().mockResolvedValue(null) } })) };
    const journal = { postEntry: vi.fn() };
    const service = new FinanceLedgerService(prisma as never, journal as never);

    await expect(service.recordSale({ amount: 100, orderId: 'o1', orderNumber: 'ORD-1', createdByUserId: 'u1' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
