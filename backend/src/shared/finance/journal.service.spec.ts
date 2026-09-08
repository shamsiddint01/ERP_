import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { JournalService } from './journal.service.js';

function fakeAccount(overrides: Partial<{ id: string; category: string; isPostable: boolean; isActive: boolean; name: string }> = {}) {
  return {
    id: overrides.id ?? 'acc1',
    name: overrides.name ?? 'Test account',
    category: overrides.category ?? 'ASSET',
    isPostable: overrides.isPostable ?? true,
    isActive: overrides.isActive ?? true,
  };
}

function createPrismaMock(accounts: ReturnType<typeof fakeAccount>[]) {
  const txStub = {
    account: {
      findMany: vi.fn().mockResolvedValue(accounts),
      update: vi.fn().mockResolvedValue({}),
    },
    journalEntry: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'je1', ...data, lines: data.lines.create })),
    },
  };
  return { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)), __tx: txStub };
}

describe('JournalService.postEntry', () => {
  it('rejects an entry with fewer than two lines', async () => {
    const prisma = createPrismaMock([fakeAccount()]);
    const service = new JournalService(prisma as never);

    await expect(
      service.postEntry({ description: 'test', createdByUserId: 'user1', lines: [{ accountId: 'acc1', debit: 100 }] }, prisma.__tx as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a line with both a debit and a credit', async () => {
    const prisma = createPrismaMock([fakeAccount({ id: 'acc1' }), fakeAccount({ id: 'acc2', category: 'REVENUE' })]);
    const service = new JournalService(prisma as never);

    await expect(
      service.postEntry(
        {
          description: 'test',
          createdByUserId: 'user1',
          lines: [
            { accountId: 'acc1', debit: 100, credit: 50 },
            { accountId: 'acc2', credit: 100 },
          ],
        },
        prisma.__tx as never,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an unbalanced entry (debit != credit)', async () => {
    const prisma = createPrismaMock([fakeAccount({ id: 'acc1' }), fakeAccount({ id: 'acc2', category: 'REVENUE' })]);
    const service = new JournalService(prisma as never);

    await expect(
      service.postEntry(
        {
          description: 'test',
          createdByUserId: 'user1',
          lines: [
            { accountId: 'acc1', debit: 100 },
            { accountId: 'acc2', credit: 99.99 },
          ],
        },
        prisma.__tx as never,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('accepts a balanced entry after Decimal-style rounding (0.1 + 0.2 style sums)', async () => {
    const prisma = createPrismaMock([fakeAccount({ id: 'acc1' }), fakeAccount({ id: 'acc2', category: 'REVENUE' })]);
    const service = new JournalService(prisma as never);

    await expect(
      service.postEntry(
        {
          description: 'test',
          createdByUserId: 'user1',
          lines: [
            { accountId: 'acc1', debit: 0.1 },
            { accountId: 'acc1', debit: 0.2 },
            { accountId: 'acc2', credit: 0.3 },
          ],
        },
        prisma.__tx as never,
      ),
    ).resolves.toBeDefined();
  });

  it('rejects posting to a non-postable (header) account', async () => {
    const prisma = createPrismaMock([fakeAccount({ id: 'acc1', isPostable: false }), fakeAccount({ id: 'acc2', category: 'REVENUE' })]);
    const service = new JournalService(prisma as never);

    await expect(
      service.postEntry(
        {
          description: 'test',
          createdByUserId: 'user1',
          lines: [
            { accountId: 'acc1', debit: 100 },
            { accountId: 'acc2', credit: 100 },
          ],
        },
        prisma.__tx as never,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects posting to an inactive account', async () => {
    const prisma = createPrismaMock([fakeAccount({ id: 'acc1', isActive: false }), fakeAccount({ id: 'acc2', category: 'REVENUE' })]);
    const service = new JournalService(prisma as never);

    await expect(
      service.postEntry(
        {
          description: 'test',
          createdByUserId: 'user1',
          lines: [
            { accountId: 'acc1', debit: 100 },
            { accountId: 'acc2', credit: 100 },
          ],
        },
        prisma.__tx as never,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a line referencing a non-existent account', async () => {
    const prisma = createPrismaMock([fakeAccount({ id: 'acc2', category: 'REVENUE' })]);
    const service = new JournalService(prisma as never);

    await expect(
      service.postEntry(
        {
          description: 'test',
          createdByUserId: 'user1',
          lines: [
            { accountId: 'missing', debit: 100 },
            { accountId: 'acc2', credit: 100 },
          ],
        },
        prisma.__tx as never,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('increments a debit-normal account by (debit - credit) and a credit-normal account by (credit - debit)', async () => {
    const prisma = createPrismaMock([fakeAccount({ id: 'ar', category: 'ASSET' }), fakeAccount({ id: 'rev', category: 'REVENUE' })]);
    const service = new JournalService(prisma as never);

    await service.postEntry(
      {
        description: 'Sale',
        createdByUserId: 'user1',
        lines: [
          { accountId: 'ar', debit: 6600 },
          { accountId: 'rev', credit: 6600 },
        ],
      },
      prisma.__tx as never,
    );

    expect(prisma.__tx.account.update).toHaveBeenCalledWith({ where: { id: 'ar' }, data: { currentBalance: { increment: 6600 } } });
    expect(prisma.__tx.account.update).toHaveBeenCalledWith({ where: { id: 'rev' }, data: { currentBalance: { increment: 6600 } } });
  });
});
