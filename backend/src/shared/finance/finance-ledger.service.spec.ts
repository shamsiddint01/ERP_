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
  [ACCOUNT_CODES.SALARIES_EXPENSE]: { id: 'salary-expense-id', code: ACCOUNT_CODES.SALARIES_EXPENSE },
  [ACCOUNT_CODES.PAYROLL_PAYABLE]: { id: 'payroll-payable-id', code: ACCOUNT_CODES.PAYROLL_PAYABLE },
  [ACCOUNT_CODES.DEDUCTIONS_PAYABLE]: { id: 'deductions-payable-id', code: ACCOUNT_CODES.DEDUCTIONS_PAYABLE },
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

  it('recordPayrollApproval posts Dr Salary Expense / Cr Payroll Payable / Cr Deductions Payable when deductions > 0', async () => {
    const prisma = createPrismaMock();
    const { service, journal } = createService(prisma);

    await service.recordPayrollApproval(
      { grossSalary: 10500000, netSalary: 10200000, deductionAmount: 300000, payrollId: 'p1', payrollNumber: 'PYR-1', createdByUserId: 'user1' },
      prisma.__tx as never,
    );

    expect(journal.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceType: 'PAYROLL',
        lines: [
          { accountId: 'salary-expense-id', debit: 10500000 },
          { accountId: 'payroll-payable-id', credit: 10200000 },
          { accountId: 'deductions-payable-id', credit: 300000 },
        ],
      }),
      prisma.__tx,
    );
  });

  it('recordPayrollApproval omits the Deductions Payable line entirely when deductions are zero', async () => {
    const prisma = createPrismaMock();
    const { service, journal } = createService(prisma);

    await service.recordPayrollApproval(
      { grossSalary: 10000000, netSalary: 10000000, deductionAmount: 0, payrollId: 'p1', payrollNumber: 'PYR-1', createdByUserId: 'user1' },
      prisma.__tx as never,
    );

    expect(journal.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          { accountId: 'salary-expense-id', debit: 10000000 },
          { accountId: 'payroll-payable-id', credit: 10000000 },
        ],
      }),
      prisma.__tx,
    );
  });

  it('recordPayrollApprovalReversal exactly inverts recordPayrollApproval', async () => {
    const prisma = createPrismaMock();
    const { service, journal } = createService(prisma);

    await service.recordPayrollApprovalReversal(
      { grossSalary: 10500000, netSalary: 10200000, deductionAmount: 300000, payrollId: 'p1', payrollNumber: 'PYR-1', createdByUserId: 'user1' },
      prisma.__tx as never,
    );

    expect(journal.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          { accountId: 'payroll-payable-id', debit: 10200000 },
          { accountId: 'salary-expense-id', credit: 10500000 },
          { accountId: 'deductions-payable-id', debit: 300000 },
        ],
      }),
      prisma.__tx,
    );
  });

  it('recordPayrollPayment clears the payable — Dr Payroll Payable / Cr Cash-or-Bank', async () => {
    const prisma = createPrismaMock();
    const { service, journal } = createService(prisma);

    await service.recordPayrollPayment(
      { netSalary: 10200000, method: 'BANK_TRANSFER', payrollId: 'p1', payrollNumber: 'PYR-1', createdByUserId: 'user1' },
      prisma.__tx as never,
    );

    expect(journal.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceType: 'PAYROLL',
        lines: [
          { accountId: 'payroll-payable-id', debit: 10200000 },
          { accountId: 'bank-id', credit: 10200000 },
        ],
      }),
      prisma.__tx,
    );
  });
});
