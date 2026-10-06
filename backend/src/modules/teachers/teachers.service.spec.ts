import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { TeachersService } from './teachers.service.js';

function fakeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile1',
    employeeId: 'emp1',
    status: 'ACTIVE',
    specialization: 'IELTS',
    employee: { id: 'emp1', firstName: 'Sarvinoz', middleName: null, lastName: 'Toshkentova' },
    ...overrides,
  };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  const prisma = {
    teacherProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeProfile(data))),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeProfile(data))),
      ...(overrides.teacherProfile as Record<string, unknown>),
    },
    employee: {
      count: vi.fn().mockResolvedValue(4),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'emp-new', ...data })),
      ...(overrides.employee as Record<string, unknown>),
    },
    studentGroup: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      ...(overrides.studentGroup as Record<string, unknown>),
    },
    enrollment: { findMany: vi.fn().mockResolvedValue([]), ...(overrides.enrollment as Record<string, unknown>) },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new TeachersService(prisma as never, new AuditEntityRegistryService());
}

describe('TeachersService', () => {
  describe('create', () => {
    const dto = { firstName: 'Jahongir', lastName: 'Rustamov', phone: '+998901112233', specialization: 'IELTS' };

    it('creates the underlying employee and the teacher profile together, in one transaction', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      const result = await service.create(dto);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.employee.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ firstName: 'Jahongir', lastName: 'Rustamov', fullName: 'Jahongir Rustamov', phone: '+998901112233' }),
      });
      expect(result).toMatchObject({ employeeId: 'emp-new', specialization: 'IELTS' });
    });

    it('generates a sequential TCH employee code', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.create(dto);

      const { data } = prisma.employee.create.mock.calls[0][0] as { data: { employeeCode: string } };
      expect(data.employeeCode).toMatch(/^TCH-\d{4}-000005$/);
    });

    it('includes the middle name in fullName when given', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.create({ ...dto, middleName: 'Akmal o‘g‘li' });

      expect(prisma.employee.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fullName: 'Jahongir Akmal o‘g‘li Rustamov' }) });
    });
  });

  describe('update', () => {
    it('throws NotFoundException for a non-existent profile', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.update('missing', { status: 'INACTIVE' })).rejects.toThrow(NotFoundException);
    });

    it('refuses to deactivate a teacher who still has open groups', async () => {
      const prisma = createPrismaMock({
        teacherProfile: { findUnique: vi.fn().mockResolvedValue(fakeProfile()) },
        studentGroup: { count: vi.fn().mockResolvedValue(2) },
      });
      const service = createService(prisma);

      await expect(service.update('profile1', { status: 'INACTIVE' })).rejects.toThrow(ConflictException);
    });

    it('allows deactivating a teacher with no open groups', async () => {
      const prisma = createPrismaMock({ teacherProfile: { findUnique: vi.fn().mockResolvedValue(fakeProfile()) } });
      const service = createService(prisma);

      const result = await service.update('profile1', { status: 'INACTIVE' });
      expect(result).toMatchObject({ status: 'INACTIVE' });
    });

    it('rebuilds the employee fullName when only part of the name changes', async () => {
      const prisma = createPrismaMock({ teacherProfile: { findUnique: vi.fn().mockResolvedValue(fakeProfile()) } });
      const service = createService(prisma);

      await service.update('profile1', { lastName: 'Karimova' });

      expect(prisma.teacherProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ employee: { update: expect.objectContaining({ lastName: 'Karimova', fullName: 'Sarvinoz Karimova' }) } }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('deactivates instead of hard-deleting', async () => {
      const prisma = createPrismaMock({ teacherProfile: { findUnique: vi.fn().mockResolvedValue(fakeProfile()) } });
      const service = createService(prisma);

      const result = await service.remove('profile1');
      expect(result).toMatchObject({ status: 'INACTIVE' });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a non-existent profile', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('computes a real workload summary from groups and enrollments', async () => {
      const prisma = createPrismaMock({
        teacherProfile: { findUnique: vi.fn().mockResolvedValue(fakeProfile()) },
        studentGroup: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'g1', status: 'ACTIVE', _count: { enrollments: 5 } },
            { id: 'g2', status: 'COMPLETED', _count: { enrollments: 3 } },
          ]),
        },
        enrollment: {
          findMany: vi.fn().mockResolvedValue([{ studentId: 's1' }, { studentId: 's2' }, { studentId: 's3' }]),
        },
      });
      const service = createService(prisma);

      const result = await service.findOne('profile1');
      expect(result.workload).toEqual({ activeGroupsCount: 1, activeStudentsCount: 8, totalEnrolledStudents: 3 });
    });
  });

  describe('findAll', () => {
    it('filters by branch via the groups the teacher teaches there', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ branchId: 'branch1', page: 1, pageSize: 20 });

      expect(prisma.teacherProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employee: { taughtGroups: { some: { branchId: 'branch1' } } },
          }),
        }),
      );
    });

    it('applies a search filter across employee fields and specialization', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.findAll({ search: 'IELTS', page: 1, pageSize: 20 });

      expect(prisma.teacherProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.arrayContaining([{ specialization: { contains: 'IELTS', mode: 'insensitive' } }]) }),
        }),
      );
    });
  });
});
