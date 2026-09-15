import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { EnrollmentsService } from './enrollments.service.js';

function fakeEnrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'enr1',
    studentId: 'student1',
    groupId: 'group1',
    status: 'ACTIVE',
    startDate: new Date('2026-09-01'),
    endDate: null,
    agreedTuition: '600000',
    discountAmount: null,
    ...overrides,
  };
}

function fakeGroup(overrides: Record<string, unknown> = {}) {
  return { id: 'group1', capacity: 12, status: 'ACTIVE', tuitionAmount: '600000', ...overrides };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  const txOverrides = (overrides.tx ?? {}) as Record<string, unknown>;
  const txStub = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    enrollment: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeEnrollment({ id: 'new-enr', status: 'ACTIVE', ...data }))),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...(txOverrides.enrollment as Record<string, unknown>),
    },
  };
  return {
    student: { findUnique: vi.fn().mockResolvedValue({ id: 'student1' }), ...(overrides.student as Record<string, unknown>) },
    studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup()), ...(overrides.studentGroup as Record<string, unknown>) },
    enrollment: {
      findUnique: vi.fn().mockResolvedValue(fakeEnrollment()),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fakeEnrollment(data))),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...(overrides.enrollment as Record<string, unknown>),
    },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)),
    __tx: txStub,
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new EnrollmentsService(prisma as never, new AuditEntityRegistryService());
}

describe('EnrollmentsService', () => {
  describe('create', () => {
    it('rejects an unknown student', async () => {
      const prisma = createPrismaMock({ student: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.create({ studentId: 'missing', groupId: 'group1' })).rejects.toThrow(NotFoundException);
    });

    it('rejects an unknown group', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.create({ studentId: 'student1', groupId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('rejects enrolling into a COMPLETED group', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup({ status: 'COMPLETED' })) } });
      const service = createService(prisma);

      await expect(service.create({ studentId: 'student1', groupId: 'group1' })).rejects.toThrow(ConflictException);
    });

    it('rejects enrolling into a CANCELLED group', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup({ status: 'CANCELLED' })) } });
      const service = createService(prisma);

      await expect(service.create({ studentId: 'student1', groupId: 'group1' })).rejects.toThrow(ConflictException);
    });

    it('rejects a discount that exceeds the agreed tuition', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.create({ studentId: 'student1', groupId: 'group1', agreedTuition: 100, discountAmount: 200 })).rejects.toThrow(BadRequestException);
    });

    it('rejects an end date before the start date', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(
        service.create({ studentId: 'student1', groupId: 'group1', startDate: '2026-09-10', endDate: '2026-09-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate active enrollment for the same student and group', async () => {
      const prisma = createPrismaMock({ tx: { enrollment: { findFirst: vi.fn().mockResolvedValue(fakeEnrollment()) } } });
      const service = createService(prisma);

      await expect(service.create({ studentId: 'student1', groupId: 'group1' })).rejects.toThrow(ConflictException);
    });

    it('allows historical re-enrollment when the prior enrollment is no longer active', async () => {
      // findFirst is scoped to status: 'ACTIVE' inside the service — a COMPLETED
      // prior enrollment must never trip this guard, so the mock returning null
      // (no ACTIVE row) here is exactly what a real DB would also return.
      const prisma = createPrismaMock({ tx: { enrollment: { findFirst: vi.fn().mockResolvedValue(null) } } });
      const service = createService(prisma);

      await expect(service.create({ studentId: 'student1', groupId: 'group1' })).resolves.toBeTruthy();
    });

    it('rejects when the group is already at full capacity', async () => {
      const prisma = createPrismaMock({
        studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup({ capacity: 2 })) },
        tx: { enrollment: { count: vi.fn().mockResolvedValue(2) } },
      });
      const service = createService(prisma);

      await expect(service.create({ studentId: 'student1', groupId: 'group1' })).rejects.toThrow(ConflictException);
    });

    it('succeeds and defaults agreedTuition from the group when not given', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.create({ studentId: 'student1', groupId: 'group1' });

      expect(prisma.__tx.enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ agreedTuition: 600000 }) }),
      );
    });

    it('locks the target group via a transaction-scoped advisory lock before counting', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.create({ studentId: 'student1', groupId: 'group1' });

      expect(prisma.__tx.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('rejects a discount that would exceed the (possibly unchanged) agreed tuition', async () => {
      const prisma = createPrismaMock({ enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ agreedTuition: '100' })) } });
      const service = createService(prisma);

      await expect(service.update('enr1', { discountAmount: 500 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('status workflow', () => {
    it('pause: allows ACTIVE -> PAUSED', async () => {
      const prisma = createPrismaMock({ enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'ACTIVE' })) } });
      const service = createService(prisma);

      await service.pause('enr1');

      expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({ where: { id: 'enr1', status: 'ACTIVE' }, data: { status: 'PAUSED' } });
    });

    it('pause: rejects from COMPLETED', async () => {
      const prisma = createPrismaMock({ enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'COMPLETED' })) } });
      const service = createService(prisma);

      await expect(service.pause('enr1')).rejects.toThrow(ConflictException);
    });

    it('activate: allows PAUSED -> ACTIVE', async () => {
      const prisma = createPrismaMock({ enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'PAUSED' })) } });
      const service = createService(prisma);

      await expect(service.activate('enr1')).resolves.toBeTruthy();
    });

    it('activate: rejects from ACTIVE (already active)', async () => {
      const prisma = createPrismaMock({ enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'ACTIVE' })) } });
      const service = createService(prisma);

      await expect(service.activate('enr1')).rejects.toThrow(ConflictException);
    });

    it('activate: rejects re-entering a group that has since filled to capacity', async () => {
      const prisma = createPrismaMock({
        enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'PAUSED' })) },
        studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup({ capacity: 1 })) },
        tx: { enrollment: { count: vi.fn().mockResolvedValue(1) } },
      });
      const service = createService(prisma);

      await expect(service.activate('enr1')).rejects.toThrow(ConflictException);
    });

    it('activate: rejects when the student already has another active enrollment in the same group', async () => {
      const prisma = createPrismaMock({
        enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'PAUSED' })) },
        tx: { enrollment: { findFirst: vi.fn().mockResolvedValue(fakeEnrollment({ id: 'other-enr', status: 'ACTIVE' })) } },
      });
      const service = createService(prisma);

      await expect(service.activate('enr1')).rejects.toThrow(ConflictException);
    });

    it('activate: takes the same per-group advisory lock as create()/transfer()', async () => {
      const prisma = createPrismaMock({ enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'PAUSED', groupId: 'group1' })) } });
      const service = createService(prisma);

      await service.activate('enr1');

      expect(prisma.__tx.$executeRaw).toHaveBeenCalled();
    });

    it('complete: allows ACTIVE -> COMPLETED', async () => {
      const prisma = createPrismaMock({ enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'ACTIVE' })) } });
      const service = createService(prisma);

      await expect(service.complete('enr1')).resolves.toBeTruthy();
    });

    it('complete: rejects from PAUSED', async () => {
      const prisma = createPrismaMock({ enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'PAUSED' })) } });
      const service = createService(prisma);

      await expect(service.complete('enr1')).rejects.toThrow(ConflictException);
    });

    it('cancel: allows ACTIVE -> CANCELLED and PAUSED -> CANCELLED', async () => {
      const activePrisma = createPrismaMock({ enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'ACTIVE' })) } });
      await expect(createService(activePrisma).cancel('enr1')).resolves.toBeTruthy();

      const pausedPrisma = createPrismaMock({ enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'PAUSED' })) } });
      await expect(createService(pausedPrisma).cancel('enr1')).resolves.toBeTruthy();
    });

    it('cancel: rejects from a terminal TRANSFERRED state', async () => {
      const prisma = createPrismaMock({ enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'TRANSFERRED' })) } });
      const service = createService(prisma);

      await expect(service.cancel('enr1')).rejects.toThrow(ConflictException);
    });

    it('rejects when the status changed concurrently (CAS lost the race)', async () => {
      const prisma = createPrismaMock({
        enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'ACTIVE' })), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      });
      const service = createService(prisma);

      await expect(service.pause('enr1')).rejects.toThrow(ConflictException);
    });

    it('remove() cancels rather than hard-deleting', async () => {
      const prisma = createPrismaMock({ enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'ACTIVE' })) } });
      const service = createService(prisma);

      await service.remove('enr1');

      expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({ where: { id: 'enr1', status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
    });
  });

  describe('transfer', () => {
    it('rejects transferring into the same group', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.transfer('enr1', { targetGroupId: 'group1' })).rejects.toThrow(BadRequestException);
    });

    it('rejects transferring a COMPLETED enrollment', async () => {
      const prisma = createPrismaMock({ enrollment: { findUnique: vi.fn().mockResolvedValue(fakeEnrollment({ status: 'COMPLETED' })) } });
      const service = createService(prisma);

      await expect(service.transfer('enr1', { targetGroupId: 'group2' })).rejects.toThrow(ConflictException);
    });

    it('rejects an unknown target group', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue(null) } });
      const service = createService(prisma);

      await expect(service.transfer('enr1', { targetGroupId: 'group2' })).rejects.toThrow(NotFoundException);
    });

    it('rejects transferring into a CANCELLED target group', async () => {
      const prisma = createPrismaMock({ studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup({ id: 'group2', status: 'CANCELLED' })) } });
      const service = createService(prisma);

      await expect(service.transfer('enr1', { targetGroupId: 'group2' })).rejects.toThrow(ConflictException);
    });

    it('rejects when the target group is already at full capacity', async () => {
      const prisma = createPrismaMock({
        studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup({ id: 'group2', capacity: 1 })) },
        tx: { enrollment: { count: vi.fn().mockResolvedValue(1) } },
      });
      const service = createService(prisma);

      await expect(service.transfer('enr1', { targetGroupId: 'group2' })).rejects.toThrow(ConflictException);
    });

    it('rejects when the student already has an active enrollment in the target group', async () => {
      const prisma = createPrismaMock({
        studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup({ id: 'group2' })) },
        tx: { enrollment: { findFirst: vi.fn().mockResolvedValue(fakeEnrollment({ groupId: 'group2' })) } },
      });
      const service = createService(prisma);

      await expect(service.transfer('enr1', { targetGroupId: 'group2' })).rejects.toThrow(ConflictException);
    });

    it('rejects when the source enrollment was changed concurrently (CAS lost the race)', async () => {
      const prisma = createPrismaMock({
        studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup({ id: 'group2' })) },
        tx: { enrollment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } },
      });
      const service = createService(prisma);

      await expect(service.transfer('enr1', { targetGroupId: 'group2' })).rejects.toThrow(ConflictException);
    });

    it('succeeds: old enrollment is TRANSFERRED and a new ACTIVE enrollment is created in one transaction', async () => {
      const prisma = createPrismaMock({
        enrollment: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(fakeEnrollment({ status: 'ACTIVE' })) // findOne() at the top of transfer()
            .mockResolvedValueOnce(fakeEnrollment({ status: 'TRANSFERRED' })) // findOne(oldEnrollmentId) after commit
            .mockResolvedValueOnce(fakeEnrollment({ id: 'new-enr', groupId: 'group2', status: 'ACTIVE' })), // findOne(newEnrollmentId)
        },
        studentGroup: { findUnique: vi.fn().mockResolvedValue(fakeGroup({ id: 'group2' })) },
      });
      const service = createService(prisma);

      const result = await service.transfer('enr1', { targetGroupId: 'group2' });

      expect(prisma.__tx.enrollment.updateMany).toHaveBeenCalledWith({ where: { id: 'enr1', status: 'ACTIVE' }, data: { status: 'TRANSFERRED' } });
      expect(prisma.__tx.enrollment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ studentId: 'student1', groupId: 'group2' }) }));
      expect(result).toMatchObject({ status: 'TRANSFERRED', transferredTo: { status: 'ACTIVE' } });
    });
  });
});
