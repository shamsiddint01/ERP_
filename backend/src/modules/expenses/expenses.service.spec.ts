import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { ExpensesService } from './expenses.service.js';

function fakeExpense(overrides: Partial<{ status: string; amount: string; categoryAccountId: string | null; paymentMethod: string }> = {}) {
  return {
    id: 'exp1',
    expenseNumber: 'EXP-2026-000001',
    status: overrides.status ?? 'PENDING',
    amount: overrides.amount ?? '500.00',
    paymentMethod: overrides.paymentMethod ?? 'CASH',
    category: { id: 'cat1', name: 'Rent', accountId: overrides.categoryAccountId === undefined ? 'rent-account-id' : overrides.categoryAccountId },
  };
}

function createPrismaMock(expense: ReturnType<typeof fakeExpense>) {
  const txStub = {
    expense: { update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...expense, ...data })) },
  };
  return {
    expense: { findUnique: vi.fn().mockResolvedValue(expense) },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)),
    __tx: txStub,
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>, financeLedgerOverrides: Record<string, unknown> = {}) {
  const financeLedger = {
    recordExpenseApproval: vi.fn().mockResolvedValue({}),
    recordExpensePayment: vi.fn().mockResolvedValue({}),
    recordExpenseApprovalReversal: vi.fn().mockResolvedValue({}),
    resolveCashOrBankAccount: vi.fn().mockResolvedValue({ id: 'cash-id' }),
    ...financeLedgerOverrides,
  };
  const service = new ExpensesService(prisma as never, financeLedger as never, new AuditEntityRegistryService());
  return { service, financeLedger };
}

describe('ExpensesService', () => {
  describe('approve', () => {
    it('refuses to approve a non-PENDING expense', async () => {
      const prisma = createPrismaMock(fakeExpense({ status: 'DRAFT' }));
      const { service } = createService(prisma);

      await expect(service.approve('exp1', 'user1')).rejects.toThrow(ConflictException);
    });

    it('refuses to approve when the expense category has no linked account', async () => {
      const prisma = createPrismaMock(fakeExpense({ status: 'PENDING', categoryAccountId: null }));
      const { service } = createService(prisma);

      await expect(service.approve('exp1', 'user1')).rejects.toThrow(BadRequestException);
    });

    it('posts Dr Expense / Cr Accounts Payable and moves to APPROVED', async () => {
      const prisma = createPrismaMock(fakeExpense({ status: 'PENDING', amount: '500.00' }));
      const { service, financeLedger } = createService(prisma);

      const result = await service.approve('exp1', 'user1');

      expect(financeLedger.recordExpenseApproval).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 500, expenseAccountId: 'rent-account-id' }),
        prisma.__tx,
      );
      expect(result).toMatchObject({ status: 'APPROVED' });
    });
  });

  describe('pay', () => {
    it('refuses to pay a non-APPROVED expense', async () => {
      const prisma = createPrismaMock(fakeExpense({ status: 'PENDING' }));
      const { service } = createService(prisma);

      await expect(service.pay('exp1', 'user1')).rejects.toThrow(ConflictException);
    });

    it('resolves the Cash/Bank account and clears the payable', async () => {
      const prisma = createPrismaMock(fakeExpense({ status: 'APPROVED', amount: '500.00', paymentMethod: 'BANK_TRANSFER' }));
      const { service, financeLedger } = createService(prisma);

      const result = await service.pay('exp1', 'user1');

      expect(financeLedger.resolveCashOrBankAccount).toHaveBeenCalledWith('BANK_TRANSFER', prisma.__tx);
      expect(financeLedger.recordExpensePayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 500, method: 'BANK_TRANSFER' }), prisma.__tx);
      expect(result).toMatchObject({ status: 'PAID', paymentAccountId: 'cash-id' });
    });
  });

  describe('cancel', () => {
    it('reverses the posted liability when cancelling an APPROVED expense', async () => {
      const prisma = createPrismaMock(fakeExpense({ status: 'APPROVED', amount: '500.00' }));
      const { service, financeLedger } = createService(prisma);

      const result = await service.cancel('exp1', 'user1');

      expect(financeLedger.recordExpenseApprovalReversal).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 500, expenseAccountId: 'rent-account-id' }),
        prisma.__tx,
      );
      expect(result).toMatchObject({ status: 'CANCELLED' });
    });

    it('does not post any reversal when cancelling a DRAFT expense', async () => {
      const prisma = createPrismaMock(fakeExpense({ status: 'DRAFT' }));
      const { service, financeLedger } = createService(prisma);

      await service.cancel('exp1', 'user1');

      expect(financeLedger.recordExpenseApprovalReversal).not.toHaveBeenCalled();
    });

    it('refuses to cancel an already-PAID expense', async () => {
      const prisma = createPrismaMock(fakeExpense({ status: 'PAID' }));
      const { service } = createService(prisma);

      await expect(service.cancel('exp1', 'user1')).rejects.toThrow(ConflictException);
    });
  });
});
