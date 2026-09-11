import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { CourseCategoriesService } from './course-categories.service.js';

function fakeCategory(overrides: Record<string, unknown> = {}) {
  return { id: 'cat1', name: 'Languages', code: 'CAT-LANG', status: 'ACTIVE', ...overrides };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    courseCategory: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeCategory(data))),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeCategory(data))),
      ...(overrides.courseCategory as Record<string, unknown>),
    },
    course: {
      count: vi.fn().mockResolvedValue(0),
      ...(overrides.course as Record<string, unknown>),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new CourseCategoriesService(prisma as never, new AuditEntityRegistryService());
}

describe('CourseCategoriesService', () => {
  describe('create', () => {
    it('rejects a duplicate category code', async () => {
      const prisma = createPrismaMock({ courseCategory: { findUnique: vi.fn().mockResolvedValue(fakeCategory()) } });
      const service = createService(prisma);

      await expect(service.create({ name: 'Languages', code: 'CAT-LANG' })).rejects.toThrow(ConflictException);
    });

    it('creates a category when the code is free', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      const result = await service.create({ name: 'IT', code: 'CAT-IT' });

      expect(result).toMatchObject({ name: 'IT', code: 'CAT-IT' });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a non-existent category', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('rejects renaming the code to one already used by another category', async () => {
      const prisma = createPrismaMock({
        courseCategory: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(fakeCategory({ id: 'cat1', code: 'CAT-LANG' })) // findOne() inside update()
            .mockResolvedValueOnce(fakeCategory({ id: 'other-cat', code: 'CAT-IT' })), // the code-collision check
        },
      });
      const service = createService(prisma);

      await expect(service.update('cat1', { code: 'CAT-IT' })).rejects.toThrow(ConflictException);
    });

    it('refuses to deactivate a category that still has courses', async () => {
      const prisma = createPrismaMock({
        courseCategory: { findUnique: vi.fn().mockResolvedValue(fakeCategory()) },
        course: { count: vi.fn().mockResolvedValue(3) },
      });
      const service = createService(prisma);

      await expect(service.update('cat1', { status: 'INACTIVE' })).rejects.toThrow(ConflictException);
    });

    it('allows deactivating a category with no courses', async () => {
      const prisma = createPrismaMock({
        courseCategory: { findUnique: vi.fn().mockResolvedValue(fakeCategory()) },
        course: { count: vi.fn().mockResolvedValue(0) },
      });
      const service = createService(prisma);

      const result = await service.update('cat1', { status: 'INACTIVE' });
      expect(result).toMatchObject({ status: 'INACTIVE' });
    });
  });

  describe('remove', () => {
    it('deactivates instead of hard-deleting, and is blocked by the same course-reference guard', async () => {
      const prisma = createPrismaMock({
        courseCategory: { findUnique: vi.fn().mockResolvedValue(fakeCategory()) },
        course: { count: vi.fn().mockResolvedValue(1) },
      });
      const service = createService(prisma);

      await expect(service.remove('cat1')).rejects.toThrow(ConflictException);
      expect(prisma.courseCategory.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('applies status and search filters with safe default sorting', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ status: 'ACTIVE', search: 'Lang', page: 1, pageSize: 20 });

      expect(prisma.courseCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE', OR: expect.arrayContaining([{ name: { contains: 'Lang', mode: 'insensitive' } }]) }),
          orderBy: { name: 'asc' },
        }),
      );
    });

    it('falls back to the default sort field when an unknown sortBy is given (no raw-order injection)', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ sortBy: 'code; DROP TABLE courses;--', page: 1, pageSize: 20 });

      expect(prisma.courseCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { name: 'asc' } }));
    });

    it('honours a known sortBy field', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ sortBy: 'code', sortDir: 'desc', page: 1, pageSize: 20 });

      expect(prisma.courseCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { code: 'desc' } }));
    });
  });
});
