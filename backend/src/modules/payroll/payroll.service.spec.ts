import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { PayrollService } from './payroll.service.js';

function fakePayroll(overrides: Partial<{ status: string }> = {}) {
  return {
    id: 'payroll1',
    payrollNumber: 'PYR-2026-000001',
    status: overrides.status ?? 'CALCULATED',
    grossSalary: '10500000',
    netSalary: '10200000',
    deductionAmount: '300000',
    lines: [{ id: 'line1', type: 'BONUS' }],
  };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  const txStub = {
    payroll: { update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...fakePayroll(), ...data })) },
  };
  return {
    payroll: {
      findUnique: vi.fn().mockResolvedValue(fakePayroll()),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'payroll1', ...data })),
      findMany: vi.fn().mockResolvedValue([]),
    },
    payrollPeriod: { findUnique: vi.fn().mockResolvedValue({ id: 'period1', status: 'OPEN', periodEnd: new Date('2026-09-30') }) },
    employee: { findUnique: vi.fn().mockResolvedValue({ id: 'emp1', deletedAt: null, hireDate: new Date('2026-01-01'), fullName: 'Aziz' }) },
    payrollComponent: { findUnique: vi.fn().mockResolvedValue(null) },
    payrollLine: { create: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)),
    __tx: txStub,
    ...overrides,
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>, financeLedgerOverrides: Record<string, unknown> = {}) {
  const calculationService = { calculate: vi.fn().mockResolvedValue({}) };
  const financeLedger = {
    recordPayrollApproval: vi.fn().mockResolvedValue({ id: 'je1' }),
    recordPayrollPayment: vi.fn().mockResolvedValue({ id: 'je2' }),
    recordPayrollApprovalReversal: vi.fn().mockResolvedValue({ id: 'je3' }),
    resolveCashOrBankAccount: vi.fn().mockResolvedValue({ id: 'bank1' }),
    ...financeLedgerOverrides,
  };
  const service = new PayrollService(prisma as never, calculationService as never, financeLedger as never, new AuditEntityRegistryService());
  return { service, financeLedger, calculationService };
}

describe('PayrollService', () => {
  describe('create', () => {
    it('rejects creating a payroll against a CLOSED period', async () => {
      const prisma = createPrismaMock({ payrollPeriod: { findUnique: vi.fn().mockResolvedValue({ id: 'period1', status: 'CLOSED' }) } });
      const { service } = createService(prisma);

      await expect(service.create('period1', 'emp1', 'user1')).rejects.toThrow(ConflictException);
    });

    it('translates a duplicate (period, employee) unique-constraint violation into a clean ConflictException', async () => {
      const prisma = createPrismaMock({
        payroll: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' })),
        },
      });
      const { service } = createService(prisma);

      await expect(service.create('period1', 'emp1', 'user1')).rejects.toThrow(ConflictException);
    });

    it('rejects an employee hired after the period ended', async () => {
      const prisma = createPrismaMock({
        employee: { findUnique: vi.fn().mockResolvedValue({ id: 'emp1', deletedAt: null, hireDate: new Date('2026-10-15'), fullName: 'New Hire' }) },
      });
      const { service } = createService(prisma);

      await expect(service.create('period1', 'emp1', 'user1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve', () => {
    it('refuses to approve a non-CALCULATED payroll', async () => {
      const prisma = createPrismaMock({ payroll: { findUnique: vi.fn().mockResolvedValue(fakePayroll({ status: 'DRAFT' })) } });
      const { service } = createService(prisma);

      await expect(service.approve('payroll1', 'user1')).rejects.toThrow(ConflictException);
    });

    it('posts the approval journal entry with gross/net/deduction amounts and stamps the entry id', async () => {
      const prisma = createPrismaMock();
      const { service, financeLedger } = createService(prisma);

      const result = await service.approve('payroll1', 'user1');

      expect(financeLedger.recordPayrollApproval).toHaveBeenCalledWith(
        expect.objectContaining({ grossSalary: 10500000, netSalary: 10200000, deductionAmount: 300000 }),
        prisma.__tx,
      );
      expect(result).toMatchObject({ status: 'APPROVED', approvalJournalEntryId: 'je1' });
    });
  });

  describe('pay', () => {
    it('refuses to pay a non-APPROVED payroll', async () => {
      const prisma = createPrismaMock({ payroll: { findUnique: vi.fn().mockResolvedValue(fakePayroll({ status: 'CALCULATED' })) } });
      const { service } = createService(prisma);

      await expect(service.pay('payroll1', { method: 'CASH' }, 'user1')).rejects.toThrow(ConflictException);
    });

    it('resolves the Cash/Bank account and clears the payable', async () => {
      const prisma = createPrismaMock({ payroll: { findUnique: vi.fn().mockResolvedValue(fakePayroll({ status: 'APPROVED' })) } });
      const { service, financeLedger } = createService(prisma);

      const result = await service.pay('payroll1', { method: 'BANK_TRANSFER' }, 'user1');

      expect(financeLedger.resolveCashOrBankAccount).toHaveBeenCalledWith('BANK_TRANSFER', prisma.__tx);
      expect(financeLedger.recordPayrollPayment).toHaveBeenCalledWith(expect.objectContaining({ netSalary: 10200000, method: 'BANK_TRANSFER' }), prisma.__tx);
      expect(result).toMatchObject({ status: 'PAID', paymentAccountId: 'bank1', paymentJournalEntryId: 'je2' });
    });
  });

  describe('cancel', () => {
    it('refuses to cancel an already-PAID payroll', async () => {
      const prisma = createPrismaMock({ payroll: { findUnique: vi.fn().mockResolvedValue(fakePayroll({ status: 'PAID' })) } });
      const { service } = createService(prisma);

      await expect(service.cancel('payroll1', {}, 'user1')).rejects.toThrow(ConflictException);
    });

    it('reverses the approval journal entry when cancelling an APPROVED payroll', async () => {
      const prisma = createPrismaMock({ payroll: { findUnique: vi.fn().mockResolvedValue(fakePayroll({ status: 'APPROVED' })) } });
      const { service, financeLedger } = createService(prisma);

      const result = await service.cancel('payroll1', { reason: 'mistake' }, 'user1');

      expect(financeLedger.recordPayrollApprovalReversal).toHaveBeenCalledWith(
        expect.objectContaining({ grossSalary: 10500000, netSalary: 10200000, deductionAmount: 300000 }),
        prisma.__tx,
      );
      expect(result).toMatchObject({ status: 'CANCELLED' });
    });

    it('does not post any reversal when cancelling a DRAFT payroll', async () => {
      const prisma = createPrismaMock({ payroll: { findUnique: vi.fn().mockResolvedValue(fakePayroll({ status: 'DRAFT' })) } });
      const { service, financeLedger } = createService(prisma);

      await service.cancel('payroll1', {}, 'user1');

      expect(financeLedger.recordPayrollApprovalReversal).not.toHaveBeenCalled();
    });
  });

  describe('removeLine', () => {
    it('refuses to remove a BASE line directly', async () => {
      const prisma = createPrismaMock({
        payroll: { findUnique: vi.fn().mockResolvedValue({ ...fakePayroll(), lines: [{ id: 'line1', type: 'BASE' }] }) },
      });
      const { service } = createService(prisma);

      await expect(service.removeLine('payroll1', 'line1')).rejects.toThrow(BadRequestException);
    });
  });
});
