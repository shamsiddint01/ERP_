import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { GuardiansService } from './guardians.service.js';

function fakeGuardian(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    fullName: 'Karim Karimov',
    phone: '+998907776655',
    relationshipType: 'FATHER',
    status: 'ACTIVE',
    ...overrides,
  };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    guardian: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeGuardian(data))),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeGuardian(data))),
      ...(overrides.guardian as Record<string, unknown>),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new GuardiansService(prisma as never, new AuditEntityRegistryService());
}

describe('GuardiansService', () => {
  describe('findOne', () => {
    it('throws NotFoundException for a non-existent guardian', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the guardian with its linked students', async () => {
      const prisma = createPrismaMock({ guardian: { findUnique: vi.fn().mockResolvedValue(fakeGuardian()) } });
      const service = createService(prisma);

      const result = await service.findOne('g1');

      expect(result).toMatchObject({ id: 'g1', fullName: 'Karim Karimov' });
    });
  });

  describe('create', () => {
    it('creates a guardian record as given', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      const result = await service.create({ fullName: 'Nodira Yusupova', phone: '+998907776656' });

      expect(prisma.guardian.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { fullName: 'Nodira Yusupova', phone: '+998907776656' } }),
      );
      expect(result).toMatchObject({ fullName: 'Nodira Yusupova' });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when updating a guardian that does not exist', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.update('missing', { fullName: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('updates an existing guardian', async () => {
      const prisma = createPrismaMock({ guardian: { findUnique: vi.fn().mockResolvedValue(fakeGuardian()) } });
      const service = createService(prisma);

      await service.update('g1', { address: 'Tashkent' });

      expect(prisma.guardian.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { address: 'Tashkent' },
        include: expect.anything(),
      });
    });
  });

  describe('remove', () => {
    it('sets status to INACTIVE instead of hard-deleting (no deletedAt column on Guardian)', async () => {
      const prisma = createPrismaMock({ guardian: { findUnique: vi.fn().mockResolvedValue(fakeGuardian()) } });
      const service = createService(prisma);

      await service.remove('g1');

      expect(prisma.guardian.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'g1' }, data: { status: 'INACTIVE' } }));
    });

    it('throws NotFoundException for a non-existent guardian', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('applies status and search filters and paginates', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ status: 'ACTIVE', search: 'Karim', page: 1, pageSize: 20 });

      expect(prisma.guardian.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            OR: expect.arrayContaining([{ fullName: { contains: 'Karim', mode: 'insensitive' } }]),
          }),
          skip: 0,
          take: 20,
        }),
      );
    });
  });
});
