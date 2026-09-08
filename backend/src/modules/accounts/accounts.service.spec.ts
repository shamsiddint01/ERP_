import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { AccountsService } from './accounts.service.js';

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    account: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'acc1', ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'acc1', ...data })),
      count: vi.fn().mockResolvedValue(0),
      ...overrides,
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new AccountsService(prisma as never, new AuditEntityRegistryService());
}

describe('AccountsService', () => {
  it('rejects creating an account with a duplicate code', async () => {
    const prisma = createPrismaMock({ findUnique: vi.fn().mockResolvedValue({ id: 'existing', code: '1100' }) });
    const service = createService(prisma);

    await expect(
      service.create({ code: '1100', name: 'Duplicate Cash', type: 'CASH', category: 'ASSET' }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects deactivating a system account', async () => {
    const prisma = createPrismaMock({
      findUnique: vi.fn().mockResolvedValue({ id: 'acc1', name: 'Cash', isSystemAccount: true, currentBalance: '0', isActive: true }),
    });
    const service = createService(prisma);

    await expect(service.update('acc1', { isActive: false })).rejects.toThrow(ConflictException);
  });

  it('rejects deactivating an account with a non-zero balance', async () => {
    const prisma = createPrismaMock({
      findUnique: vi.fn().mockResolvedValue({ id: 'acc1', name: 'Cash', isSystemAccount: false, currentBalance: '150.00', isActive: true }),
    });
    const service = createService(prisma);

    await expect(service.update('acc1', { isActive: false })).rejects.toThrow(ConflictException);
  });

  it('allows deactivating a non-system account with a zero balance', async () => {
    const prisma = createPrismaMock({
      findUnique: vi.fn().mockResolvedValue({ id: 'acc1', name: 'Custom account', isSystemAccount: false, currentBalance: '0.00', isActive: true }),
    });
    const service = createService(prisma);

    const result = await service.update('acc1', { isActive: false });
    expect(result).toMatchObject({ isActive: false });
  });

  it('rejects removing an account that has child accounts', async () => {
    const prisma = createPrismaMock({
      findUnique: vi.fn().mockResolvedValue({ id: 'acc1', name: 'Assets', isSystemAccount: false, currentBalance: '0.00' }),
      count: vi.fn().mockResolvedValue(2),
    });
    const service = createService(prisma);

    await expect(service.remove('acc1')).rejects.toThrow(ConflictException);
  });
});
