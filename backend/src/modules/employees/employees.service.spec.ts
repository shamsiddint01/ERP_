import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { EmployeesService } from './employees.service.js';

function fakeEmployee(overrides: Partial<{ status: string; deletedAt: Date | null; user: { id: string } | null }> = {}) {
  return {
    id: 'emp1',
    employeeCode: 'EMP-2026-000001',
    firstName: 'Aziz',
    lastName: 'Karimov',
    middleName: null,
    fullName: 'Aziz Karimov',
    status: overrides.status ?? 'ACTIVE',
    deletedAt: overrides.deletedAt ?? null,
    user: overrides.user === undefined ? null : overrides.user,
  };
}

function createPrismaMock(employee: ReturnType<typeof fakeEmployee>) {
  const txStub = {
    department: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    user: { update: vi.fn().mockResolvedValue({}) },
    employee: { update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...employee, ...data })) },
  };
  return {
    employee: {
      findUnique: vi.fn().mockResolvedValue(employee),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'emp1', ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...employee, ...data })),
    },
    department: { findUnique: vi.fn().mockResolvedValue({ id: 'dept1' }) },
    position: { findUnique: vi.fn().mockResolvedValue({ id: 'pos1', departmentId: 'dept1' }) },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)),
    __tx: txStub,
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new EmployeesService(prisma as never, new AuditEntityRegistryService());
}

describe('EmployeesService', () => {
  describe('create', () => {
    it('builds fullName from first/middle/last name and generates an employee code', async () => {
      const prisma = createPrismaMock(fakeEmployee());
      const service = createService(prisma);

      await service.create({ firstName: 'Aziz', lastName: 'Karimov', phone: '+998901234567', hireDate: '2026-01-15', departmentId: 'dept1', positionId: 'pos1' });

      expect(prisma.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ fullName: 'Aziz Karimov', employeeCode: expect.stringMatching(/^EMP-/) }) }),
      );
    });

    it('rejects a position that does not belong to the given department', async () => {
      const prisma = createPrismaMock(fakeEmployee());
      prisma.position.findUnique = vi.fn().mockResolvedValue({ id: 'pos1', departmentId: 'other-dept' });
      const service = createService(prisma);

      await expect(
        service.create({ firstName: 'Aziz', lastName: 'Karimov', phone: '+998901234567', hireDate: '2026-01-15', departmentId: 'dept1', positionId: 'pos1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-existent department', async () => {
      const prisma = createPrismaMock(fakeEmployee());
      prisma.department.findUnique = vi.fn().mockResolvedValue(null);
      const service = createService(prisma);

      await expect(
        service.create({ firstName: 'Aziz', lastName: 'Karimov', phone: '+998901234567', hireDate: '2026-01-15', departmentId: 'missing' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('rejects an employee being set as their own manager', async () => {
      const prisma = createPrismaMock(fakeEmployee());
      const service = createService(prisma);

      await expect(service.update('emp1', { managerId: 'emp1' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove (terminate)', () => {
    it('sets TERMINATED status, frees any managed department, and deactivates the linked user', async () => {
      const prisma = createPrismaMock(fakeEmployee({ user: { id: 'user1' } }));
      const service = createService(prisma);

      const result = await service.remove('emp1');

      expect(prisma.__tx.department.updateMany).toHaveBeenCalledWith({ where: { managerEmployeeId: 'emp1' }, data: { managerEmployeeId: null } });
      expect(prisma.__tx.user.update).toHaveBeenCalledWith({ where: { id: 'user1' }, data: { status: 'INACTIVE', deletedAt: expect.any(Date) } });
      expect(result).toMatchObject({ status: 'TERMINATED' });
    });

    it('refuses to terminate an already-terminated employee', async () => {
      const prisma = createPrismaMock(fakeEmployee({ status: 'TERMINATED' }));
      const service = createService(prisma);

      await expect(service.remove('emp1')).rejects.toThrow(ConflictException);
    });
  });

  describe('reactivate', () => {
    it('refuses to reactivate a non-TERMINATED employee', async () => {
      const prisma = createPrismaMock(fakeEmployee({ status: 'ACTIVE' }));
      const service = createService(prisma);

      await expect(service.reactivate('emp1')).rejects.toThrow(ConflictException);
    });

    it('reactivates a TERMINATED employee back to ACTIVE', async () => {
      const prisma = createPrismaMock(fakeEmployee({ status: 'TERMINATED' }));
      const service = createService(prisma);

      const result = await service.reactivate('emp1');

      expect(result).toMatchObject({ status: 'ACTIVE', terminationDate: null, deletedAt: null });
    });
  });
});
