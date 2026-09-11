import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { CoursesService } from './courses.service.js';

function fakeCourse(overrides: Record<string, unknown> = {}) {
  return { id: 'course1', name: 'General English', code: 'ENG-GEN', status: 'ACTIVE', categoryId: null, ...overrides };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    course: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeCourse(data))),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeCourse(data))),
      ...(overrides.course as Record<string, unknown>),
    },
    courseCategory: {
      findUnique: vi.fn().mockResolvedValue({ id: 'cat1' }),
      ...(overrides.courseCategory as Record<string, unknown>),
    },
    studentGroup: {
      count: vi.fn().mockResolvedValue(0),
      ...(overrides.studentGroup as Record<string, unknown>),
    },
    lead: {
      count: vi.fn().mockResolvedValue(0),
      ...(overrides.lead as Record<string, unknown>),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new CoursesService(prisma as never, new AuditEntityRegistryService());
}

describe('CoursesService', () => {
  describe('create', () => {
    it('rejects an unknown categoryId', async () => {
      const prisma = createPrismaMock({ courseCategory: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.create({ name: 'X', code: 'X-1', categoryId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('rejects a duplicate course code', async () => {
      const prisma = createPrismaMock({ course: { findUnique: vi.fn().mockResolvedValue(fakeCourse()) } });
      const service = createService(prisma);

      await expect(service.create({ name: 'X', code: 'ENG-GEN' })).rejects.toThrow(ConflictException);
    });

    it('creates a course with a free code and valid category', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      const result = await service.create({ name: 'Mathematics', code: 'MATH-01', categoryId: 'cat1', defaultTuition: 500000 });

      expect(result).toMatchObject({ name: 'Mathematics', code: 'MATH-01' });
    });
  });

  describe('update', () => {
    it('rejects renaming the code to one already used by another course', async () => {
      const prisma = createPrismaMock({
        course: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(fakeCourse({ id: 'course1', code: 'ENG-GEN' }))
            .mockResolvedValueOnce(fakeCourse({ id: 'other-course', code: 'IELTS' })),
        },
      });
      const service = createService(prisma);

      await expect(service.update('course1', { code: 'IELTS' })).rejects.toThrow(ConflictException);
    });

    it('refuses to deactivate a course that still has student groups', async () => {
      const prisma = createPrismaMock({
        course: { findUnique: vi.fn().mockResolvedValue(fakeCourse()) },
        studentGroup: { count: vi.fn().mockResolvedValue(2) },
      });
      const service = createService(prisma);

      await expect(service.update('course1', { status: 'INACTIVE' })).rejects.toThrow(ConflictException);
    });

    it('refuses to deactivate a course that leads still prefer', async () => {
      const prisma = createPrismaMock({
        course: { findUnique: vi.fn().mockResolvedValue(fakeCourse()) },
        studentGroup: { count: vi.fn().mockResolvedValue(0) },
        lead: { count: vi.fn().mockResolvedValue(4) },
      });
      const service = createService(prisma);

      await expect(service.update('course1', { status: 'INACTIVE' })).rejects.toThrow(ConflictException);
    });

    it('allows deactivating a course with no references', async () => {
      const prisma = createPrismaMock({ course: { findUnique: vi.fn().mockResolvedValue(fakeCourse()) } });
      const service = createService(prisma);

      const result = await service.update('course1', { status: 'INACTIVE' });
      expect(result).toMatchObject({ status: 'INACTIVE' });
    });

    it('allows moving to ARCHIVED without the reference guard (only INACTIVE is guarded)', async () => {
      const prisma = createPrismaMock({
        course: { findUnique: vi.fn().mockResolvedValue(fakeCourse()) },
        studentGroup: { count: vi.fn().mockResolvedValue(5) },
      });
      const service = createService(prisma);

      await expect(service.update('course1', { status: 'ARCHIVED' })).resolves.toBeTruthy();
    });
  });

  describe('findAll', () => {
    it('applies category/status/level filters, search, and safe sorting', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ categoryId: 'cat1', status: 'ACTIVE', level: 'BEGINNER', search: 'Eng', sortBy: 'defaultTuition', sortDir: 'desc', page: 1, pageSize: 20 });

      expect(prisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: 'cat1', status: 'ACTIVE', level: 'BEGINNER' }),
          orderBy: { defaultTuition: 'desc' },
        }),
      );
    });

    it('ignores an unsortable field and falls back to name/asc', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ sortBy: 'description', page: 1, pageSize: 20 });

      expect(prisma.course.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { name: 'asc' } }));
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a non-existent course', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
