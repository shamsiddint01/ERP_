import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { ClassroomsService } from './classrooms.service.js';

function fakeClassroom(overrides: Record<string, unknown> = {}) {
  return { id: 'room1', branchId: 'branch1', name: 'Room 101', roomNumber: '101', capacity: 14, status: 'ACTIVE', ...overrides };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    classroom: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeClassroom(data))),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeClassroom(data))),
      ...(overrides.classroom as Record<string, unknown>),
    },
    branch: {
      findUnique: vi.fn().mockResolvedValue({ id: 'branch1' }),
      ...(overrides.branch as Record<string, unknown>),
    },
    studentGroup: {
      count: vi.fn().mockResolvedValue(0),
      ...(overrides.studentGroup as Record<string, unknown>),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new ClassroomsService(prisma as never, new AuditEntityRegistryService());
}

describe('ClassroomsService', () => {
  describe('create', () => {
    it('rejects an unknown branchId', async () => {
      const prisma = createPrismaMock({ branch: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.create({ branchId: 'missing', name: 'Room X', roomNumber: '999', capacity: 10 })).rejects.toThrow(NotFoundException);
    });

    it('rejects a duplicate (branchId, roomNumber) pair', async () => {
      const prisma = createPrismaMock({ classroom: { findUnique: vi.fn().mockResolvedValue(fakeClassroom()) } });
      const service = createService(prisma);

      await expect(service.create({ branchId: 'branch1', name: 'Dup', roomNumber: '101', capacity: 10 })).rejects.toThrow(ConflictException);
    });

    it('allows the same room number in a different branch', async () => {
      const prisma = createPrismaMock({ classroom: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.create({ branchId: 'branch2', name: 'Room 101', roomNumber: '101', capacity: 10 })).resolves.toBeTruthy();
    });

    it('creates a classroom when everything is valid', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      const result = await service.create({ branchId: 'branch1', name: 'Room 102', roomNumber: '102', capacity: 10 });
      expect(result).toMatchObject({ name: 'Room 102', roomNumber: '102' });
    });
  });

  describe('update', () => {
    it('rejects moving to a room number already used in the (possibly new) branch', async () => {
      const prisma = createPrismaMock({
        classroom: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(fakeClassroom({ id: 'room1', branchId: 'branch1', roomNumber: '101' })) // findOne() inside update()
            .mockResolvedValueOnce(fakeClassroom({ id: 'other-room', branchId: 'branch1', roomNumber: '102' })), // collision check
        },
      });
      const service = createService(prisma);

      await expect(service.update('room1', { roomNumber: '102' })).rejects.toThrow(ConflictException);
    });

    it('refuses to deactivate a classroom that still has student groups', async () => {
      const prisma = createPrismaMock({
        classroom: { findUnique: vi.fn().mockResolvedValue(fakeClassroom()) },
        studentGroup: { count: vi.fn().mockResolvedValue(1) },
      });
      const service = createService(prisma);

      await expect(service.update('room1', { status: 'INACTIVE' })).rejects.toThrow(ConflictException);
    });

    it('allows deactivating a classroom with no student groups', async () => {
      const prisma = createPrismaMock({ classroom: { findUnique: vi.fn().mockResolvedValue(fakeClassroom()) } });
      const service = createService(prisma);

      const result = await service.update('room1', { status: 'INACTIVE' });
      expect(result).toMatchObject({ status: 'INACTIVE' });
    });
  });

  describe('findAll', () => {
    it('applies branchId/status filters and search across name/roomNumber', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ branchId: 'branch1', status: 'ACTIVE', search: '10', page: 1, pageSize: 20 });

      expect(prisma.classroom.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            branchId: 'branch1',
            status: 'ACTIVE',
            OR: expect.arrayContaining([{ roomNumber: { contains: '10', mode: 'insensitive' } }]),
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a non-existent classroom', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
