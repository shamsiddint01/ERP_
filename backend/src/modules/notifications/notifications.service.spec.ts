import { Logger, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';

// notifyByPermission logs-and-swallows failures by design; keep that expected
// error line out of the test output.
vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    notification: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'ntf1', isRead: false, ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      ...(overrides.notification as Record<string, unknown>),
    },
    rolePermission: {
      findMany: vi.fn().mockResolvedValue([]),
      ...(overrides.rolePermission as Record<string, unknown>),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      ...(overrides.user as Record<string, unknown>),
    },
  };
}

const service = (prisma: ReturnType<typeof createPrismaMock>) => new NotificationsService(prisma as never);

describe('NotificationsService', () => {
  describe('notify', () => {
    it('creates a notification with the default severity for its type', async () => {
      const prisma = createPrismaMock();
      const result = await service(prisma).notify({
        recipientUserId: 'user1',
        type: 'INVOICE_OVERDUE',
        title: 'Overdue',
        message: 'An invoice is overdue',
        referenceId: 'inv1',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ recipientUserId: 'user1', type: 'INVOICE_OVERDUE', severity: 'CRITICAL' }) }),
      );
      expect(result).toMatchObject({ recipientUserId: 'user1', type: 'INVOICE_OVERDUE' });
    });

    it('skips creation when an unread notification with the same (recipient, type, referenceId) already exists', async () => {
      const prisma = createPrismaMock({ notification: { findFirst: vi.fn().mockResolvedValue({ id: 'existing' }) } });
      const result = await service(prisma).notify({
        recipientUserId: 'user1',
        type: 'EXPENSE_PENDING',
        title: 'Pending',
        message: 'x',
        referenceId: 'exp1',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('still creates when dedupe is explicitly disabled', async () => {
      const prisma = createPrismaMock({ notification: { findFirst: vi.fn().mockResolvedValue({ id: 'existing' }) } });
      await service(prisma).notify({
        recipientUserId: 'user1',
        type: 'SYSTEM',
        title: 't',
        message: 'm',
        referenceId: 'ref1',
        dedupe: false,
      });
      expect(prisma.notification.create).toHaveBeenCalled();
    });
  });

  describe('notifyByPermission', () => {
    it('resolves every ACTIVE user whose role grants the permission and fans the notification out once each', async () => {
      const prisma = createPrismaMock({
        rolePermission: { findMany: vi.fn().mockResolvedValue([{ roleId: 'r1' }, { roleId: 'r2' }]) },
        user: { findMany: vi.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }, { id: 'u1' }]) },
      });

      const sent = await service(prisma).notifyByPermission('expenses', 'APPROVE', {
        type: 'EXPENSE_PENDING',
        title: 't',
        message: 'm',
        referenceId: 'exp1',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deletedAt: null, status: 'ACTIVE', roleId: { in: ['r1', 'r2'] } }) }),
      );
      // u1 and u2 — the duplicate u1 is collapsed
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(sent).toBe(2);
    });

    it('is a no-op (never throws) when no role grants the permission', async () => {
      const prisma = createPrismaMock();
      const sent = await service(prisma).notifyByPermission('expenses', 'APPROVE', { type: 'EXPENSE_PENDING', title: 't', message: 'm' });
      expect(sent).toBe(0);
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('swallows a downstream failure and returns 0 rather than bubbling it to the caller', async () => {
      const prisma = createPrismaMock({
        rolePermission: { findMany: vi.fn().mockRejectedValue(new Error('db down')) },
      });
      await expect(service(prisma).notifyByPermission('expenses', 'APPROVE', { type: 'EXPENSE_PENDING', title: 't', message: 'm' })).resolves.toBe(0);
    });
  });

  describe('findAll (ownership + unread count)', () => {
    it('scopes every query to the calling user and returns the unread count alongside the page', async () => {
      const prisma = createPrismaMock({
        notification: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([{ id: 'n1' }]),
          count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
        },
      });

      const result = await service(prisma).findAll('user1', { page: 1, pageSize: 20 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ recipientUserId: 'user1' }) }));
      expect(result).toMatchObject({ total: 1, unreadCount: 1, page: 1, pageSize: 20 });
    });
  });

  describe('markRead', () => {
    it('only marks a notification the caller owns, and 404s on a foreign / missing id', async () => {
      const prisma = createPrismaMock({
        notification: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findFirst: vi.fn().mockResolvedValue(null) },
      });
      await expect(service(prisma).markRead('user1', '00000000-0000-0000-0000-000000000000')).rejects.toThrow(NotFoundException);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ recipientUserId: 'user1', isRead: false }) }),
      );
    });

    it('marks an owned unread notification read', async () => {
      const prisma = createPrismaMock({
        notification: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findFirst: vi.fn().mockResolvedValue({ id: 'n1', isRead: true }),
        },
      });
      const result = await service(prisma).markRead('user1', '11111111-1111-1111-1111-111111111111');
      expect(result).toMatchObject({ isRead: true });
    });
  });

  describe('markAllRead', () => {
    it('flips every unread notification for the user and reports how many changed', async () => {
      const prisma = createPrismaMock({ notification: { updateMany: vi.fn().mockResolvedValue({ count: 4 }) } });
      const result = await service(prisma).markAllRead('user1');
      expect(prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { recipientUserId: 'user1', isRead: false }, data: expect.objectContaining({ isRead: true }) }),
      );
      expect(result).toEqual({ updated: 4 });
    });
  });

  describe('remove', () => {
    it('deletes only the caller-owned row and 404s otherwise', async () => {
      const prisma = createPrismaMock({ notification: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } });
      await expect(service(prisma).remove('user1', '22222222-2222-2222-2222-222222222222')).rejects.toThrow(NotFoundException);
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { id: '22222222-2222-2222-2222-222222222222', recipientUserId: 'user1' } });
    });
  });
});
