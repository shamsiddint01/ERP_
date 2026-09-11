import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { LeadsService } from './leads.service.js';

function fakeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead1',
    fullName: 'Jasur Toshpulatov',
    phone: '+998935550011',
    email: null,
    status: 'NEW',
    assignedEmployeeId: null,
    preferredBranchId: null,
    preferredCourseId: null,
    source: 'INSTAGRAM',
    convertedStudent: null,
    ...overrides,
  };
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  const txStub = {
    lead: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    student: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'stu-new', ...data })),
    },
  };
  return {
    lead: {
      findUnique: vi.fn().mockResolvedValue(fakeLead()),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeLead(data))),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve(fakeLead(data))),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockResolvedValue({ deleted: true }),
      ...(overrides.lead as Record<string, unknown>),
    },
    course: { findUnique: vi.fn().mockResolvedValue({ id: 'course1' }), ...(overrides.course as Record<string, unknown>) },
    branch: { findUnique: vi.fn().mockResolvedValue({ id: 'branch1' }), ...(overrides.branch as Record<string, unknown>) },
    employee: {
      findUnique: vi.fn().mockResolvedValue({ user: { id: 'user1' } }),
      ...(overrides.employee as Record<string, unknown>),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ employeeId: null }), ...(overrides.user as Record<string, unknown>) },
    leadActivity: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...(overrides.leadActivity as Record<string, unknown>),
    },
    student: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      ...(overrides.student as Record<string, unknown>),
    },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txStub)),
    __tx: txStub,
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>, notificationsOverrides: Record<string, unknown> = {}) {
  const notifications = { notify: vi.fn().mockResolvedValue(undefined), ...notificationsOverrides };
  const service = new LeadsService(prisma as never, notifications as never, new AuditEntityRegistryService());
  return { service, notifications };
}

describe('LeadsService', () => {
  describe('findOne', () => {
    it('throws NotFoundException for a non-existent lead', async () => {
      const prisma = createPrismaMock({ lead: { findUnique: vi.fn().mockResolvedValue(null) } });
      const { service } = createService(prisma);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('rejects an unknown preferredCourseId', async () => {
      const prisma = createPrismaMock({ course: { findUnique: vi.fn().mockResolvedValue(null) } });
      const { service } = createService(prisma);

      await expect(service.create({ fullName: 'X', phone: '+1', preferredCourseId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('rejects an unknown preferredBranchId', async () => {
      const prisma = createPrismaMock({ branch: { findUnique: vi.fn().mockResolvedValue(null) } });
      const { service } = createService(prisma);

      await expect(service.create({ fullName: 'X', phone: '+1', preferredBranchId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('rejects an unknown assignedEmployeeId', async () => {
      const prisma = createPrismaMock({ employee: { findUnique: vi.fn().mockResolvedValue(null) } });
      const { service } = createService(prisma);

      await expect(service.create({ fullName: 'X', phone: '+1', assignedEmployeeId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('notifies the assigned employee when one is set on creation', async () => {
      const prisma = createPrismaMock({
        lead: { create: vi.fn().mockResolvedValue(fakeLead({ assignedEmployeeId: 'emp1' })) },
      });
      const { service, notifications } = createService(prisma);

      await service.create({ fullName: 'X', phone: '+1', assignedEmployeeId: 'emp1' });

      expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: 'user1', type: 'SYSTEM' }));
    });

    it('does not attempt a notification when no employee is assigned', async () => {
      const prisma = createPrismaMock();
      const { service, notifications } = createService(prisma);

      await service.create({ fullName: 'X', phone: '+1' });

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('never fails the lead creation itself when the best-effort notification errors out', async () => {
      const prisma = createPrismaMock({
        lead: { create: vi.fn().mockResolvedValue(fakeLead({ assignedEmployeeId: 'emp1' })) },
      });
      const { service } = createService(prisma, { notify: vi.fn().mockRejectedValue(new Error('redis down')) });

      await expect(service.create({ fullName: 'X', phone: '+1', assignedEmployeeId: 'emp1' })).resolves.toBeTruthy();
    });
  });

  describe('update', () => {
    it('notifies only when the assignee actually changes', async () => {
      const prisma = createPrismaMock({
        lead: {
          findUnique: vi.fn().mockResolvedValue(fakeLead({ assignedEmployeeId: 'emp-old' })),
          update: vi.fn().mockResolvedValue(fakeLead({ assignedEmployeeId: 'emp-old' })),
        },
      });
      const { service, notifications } = createService(prisma);

      await service.update('lead1', { assignedEmployeeId: 'emp-old' });

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('notifies the new assignee when reassigned to a different employee', async () => {
      const prisma = createPrismaMock({
        lead: {
          findUnique: vi.fn().mockResolvedValue(fakeLead({ assignedEmployeeId: 'emp-old' })),
          update: vi.fn().mockResolvedValue(fakeLead({ assignedEmployeeId: 'emp1' })),
        },
      });
      const { service, notifications } = createService(prisma);

      await service.update('lead1', { assignedEmployeeId: 'emp1' });

      expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: 'user1' }));
    });
  });

  describe('remove', () => {
    it('refuses to delete a lead already converted to a student (status ENROLLED)', async () => {
      const prisma = createPrismaMock({ lead: { findUnique: vi.fn().mockResolvedValue(fakeLead({ status: 'ENROLLED' })) } });
      const { service } = createService(prisma);

      await expect(service.remove('lead1')).rejects.toThrow(ConflictException);
    });

    it('refuses to delete a lead carrying a convertedStudent relation even if status looks stale', async () => {
      const prisma = createPrismaMock({
        lead: { findUnique: vi.fn().mockResolvedValue(fakeLead({ status: 'NEW', convertedStudent: { id: 'stu1' } })) },
      });
      const { service } = createService(prisma);

      await expect(service.remove('lead1')).rejects.toThrow(ConflictException);
    });

    it('deletes a lead that was never converted', async () => {
      const prisma = createPrismaMock({ lead: { findUnique: vi.fn().mockResolvedValue(fakeLead({ status: 'LOST' })) } });
      const { service } = createService(prisma);

      const result = await service.remove('lead1');

      expect(prisma.lead.delete).toHaveBeenCalledWith({ where: { id: 'lead1' } });
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('addActivity', () => {
    it('throws NotFoundException when the lead does not exist', async () => {
      const prisma = createPrismaMock({ lead: { findUnique: vi.fn().mockResolvedValue(null) } });
      const { service } = createService(prisma);

      await expect(service.addActivity('missing', { type: 'NOTE' })).rejects.toThrow(NotFoundException);
    });

    it('attributes the activity to the Employee linked to the acting User', async () => {
      const prisma = createPrismaMock({ user: { findUnique: vi.fn().mockResolvedValue({ employeeId: 'emp1' }) } });
      const { service } = createService(prisma);

      await service.addActivity('lead1', { type: 'CALL', description: 'intro call' }, 'user1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user1' }, select: { employeeId: true } });
      expect(prisma.leadActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ leadId: 'lead1', type: 'CALL', employeeId: 'emp1' }),
      });
    });

    it('leaves employeeId undefined when the acting User has no linked Employee', async () => {
      const prisma = createPrismaMock({ user: { findUnique: vi.fn().mockResolvedValue({ employeeId: null }) } });
      const { service } = createService(prisma);

      await service.addActivity('lead1', { type: 'NOTE' }, 'user-without-employee');

      expect(prisma.leadActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ employeeId: undefined }) });
    });

    it('skips the User lookup entirely when no actingUserId is given', async () => {
      const prisma = createPrismaMock();
      const { service } = createService(prisma);

      await service.addActivity('lead1', { type: 'NOTE' });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.leadActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ employeeId: undefined }) });
    });
  });

  describe('removeActivity', () => {
    it('throws NotFoundException when the activity does not belong to this lead', async () => {
      const prisma = createPrismaMock({ leadActivity: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } });
      const { service } = createService(prisma);

      await expect(service.removeActivity('lead1', 'activity1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('changeStatus', () => {
    it('refuses to set ENROLLED directly — conversion must go through /convert', async () => {
      const prisma = createPrismaMock();
      const { service } = createService(prisma);

      await expect(service.changeStatus('lead1', { status: 'ENROLLED' })).rejects.toThrow(BadRequestException);
    });

    it('allows a valid forward transition (NEW -> CONTACTED)', async () => {
      const prisma = createPrismaMock({ lead: { findUnique: vi.fn().mockResolvedValue(fakeLead({ status: 'NEW' })) } });
      const { service } = createService(prisma);

      await service.changeStatus('lead1', { status: 'CONTACTED' });

      expect(prisma.lead.updateMany).toHaveBeenCalledWith({ where: { id: 'lead1', status: 'NEW' }, data: { status: 'CONTACTED' } });
    });

    it('allows the LOST -> CONTACTED recovery transition', async () => {
      const prisma = createPrismaMock({ lead: { findUnique: vi.fn().mockResolvedValue(fakeLead({ status: 'LOST' })) } });
      const { service } = createService(prisma);

      await expect(service.changeStatus('lead1', { status: 'CONTACTED' })).resolves.toBeTruthy();
    });

    it('rejects a transition that skips steps (NEW -> TRIAL_COMPLETED)', async () => {
      const prisma = createPrismaMock({ lead: { findUnique: vi.fn().mockResolvedValue(fakeLead({ status: 'NEW' })) } });
      const { service } = createService(prisma);

      await expect(service.changeStatus('lead1', { status: 'TRIAL_COMPLETED' })).rejects.toThrow(ConflictException);
    });

    it('rejects any transition out of a terminal ENROLLED lead', async () => {
      const prisma = createPrismaMock({ lead: { findUnique: vi.fn().mockResolvedValue(fakeLead({ status: 'ENROLLED' })) } });
      const { service } = createService(prisma);

      await expect(service.changeStatus('lead1', { status: 'LOST' })).rejects.toThrow(ConflictException);
    });

    it('rejects a status change that was already applied concurrently', async () => {
      const prisma = createPrismaMock({
        lead: { findUnique: vi.fn().mockResolvedValue(fakeLead({ status: 'NEW' })), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      });
      const { service } = createService(prisma);

      await expect(service.changeStatus('lead1', { status: 'CONTACTED' })).rejects.toThrow(ConflictException);
    });
  });

  describe('convert', () => {
    it('refuses to convert a lead that is already ENROLLED', async () => {
      const prisma = createPrismaMock({ lead: { findUnique: vi.fn().mockResolvedValue(fakeLead({ status: 'ENROLLED' })) } });
      const { service } = createService(prisma);

      await expect(service.convert('lead1', {})).rejects.toThrow(ConflictException);
    });

    it('refuses to convert a lead that already carries a convertedStudent', async () => {
      const prisma = createPrismaMock({
        lead: { findUnique: vi.fn().mockResolvedValue(fakeLead({ status: 'TRIAL_COMPLETED', convertedStudent: { id: 'stu1' } })) },
      });
      const { service } = createService(prisma);

      await expect(service.convert('lead1', {})).rejects.toThrow(ConflictException);
    });

    it('rejects an explicit branchId override that does not exist', async () => {
      const prisma = createPrismaMock({ branch: { findUnique: vi.fn().mockResolvedValue(null) } });
      const { service } = createService(prisma);

      await expect(service.convert('lead1', { branchId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('rejects when the (auto-generated or given) student code collides inside the transaction', async () => {
      const prisma = createPrismaMock();
      prisma.__tx.student.findUnique.mockResolvedValue({ id: 'existing-student' });
      const { service } = createService(prisma);

      await expect(service.convert('lead1', { studentCode: 'STU-0001' })).rejects.toThrow(ConflictException);
    });

    it('rejects a concurrent double-conversion via the CAS status guard', async () => {
      const prisma = createPrismaMock();
      prisma.__tx.lead.updateMany.mockResolvedValue({ count: 0 });
      const { service } = createService(prisma);

      await expect(service.convert('lead1', {})).rejects.toThrow(ConflictException);
    });

    it('splits fullName into first/last when no override names are given', async () => {
      const prisma = createPrismaMock({ lead: { findUnique: vi.fn().mockResolvedValue(fakeLead({ fullName: 'Jasur Toshpulatov' })) } });
      const { service } = createService(prisma);

      await service.convert('lead1', {});

      expect(prisma.__tx.student.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ firstName: 'Jasur', lastName: 'Toshpulatov', convertedFromLeadId: 'lead1' }) }),
      );
    });

    it('honours an explicit first/last name override instead of splitting fullName', async () => {
      const prisma = createPrismaMock({ lead: { findUnique: vi.fn().mockResolvedValue(fakeLead({ fullName: 'Jasur Toshpulatov' })) } });
      const { service } = createService(prisma);

      await service.convert('lead1', { firstName: 'J.', lastName: 'T.' });

      expect(prisma.__tx.student.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ firstName: 'J.', lastName: 'T.' }) }));
    });

    it('notifies the assigned employee after a successful conversion', async () => {
      const prisma = createPrismaMock({ lead: { findUnique: vi.fn().mockResolvedValue(fakeLead({ assignedEmployeeId: 'emp1' })) } });
      const { service, notifications } = createService(prisma);

      await service.convert('lead1', {});

      expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: 'user1' }));
    });

    it('rolls the whole conversion back (no Student left dangling) when Student creation fails', async () => {
      const prisma = createPrismaMock();
      prisma.__tx.student.create.mockRejectedValue(new Error('db constraint violation'));
      const { service } = createService(prisma);

      await expect(service.convert('lead1', {})).rejects.toThrow('db constraint violation');
    });
  });
});
