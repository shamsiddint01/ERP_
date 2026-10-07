import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { decryptCredential } from '../../shared/security/credential-cipher.js';
import { AuthService, nextSelfPasswordChange } from './auth.service.js';

async function createService(currentPassword = 'eskiparol1', userFields: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash(currentPassword, 4);
  const prisma = {
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1', passwordHash, passwordChangedAt: null, student: null, employee: null, ...userFields }), update: vi.fn().mockReturnValue('user-update') },
    userSession: { updateMany: vi.fn().mockReturnValue('session-revoke') },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new AuthService(prisma as any, {} as any, {} as any, {} as any);
  return { service, prisma };
}

describe('AuthService.changePassword', () => {
  it('rejects a wrong current password', async () => {
    const { service, prisma } = await createService();
    await expect(service.changePassword('u1', 'notright', 'yangiparol1')).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reusing the same password', async () => {
    const { service } = await createService();
    await expect(service.changePassword('u1', 'eskiparol1', 'eskiparol1')).rejects.toThrow(BadRequestException);
  });

  it('stores a new hash plus an admin-readable copy and revokes every OTHER session, keeping the current device signed in', async () => {
    const { service, prisma } = await createService();
    await service.changePassword('u1', 'eskiparol1', 'yangiparol1', 'session-current.secret');

    const { data } = prisma.user.update.mock.calls[0][0];
    expect(await bcrypt.compare('yangiparol1', data.passwordHash)).toBe(true);
    // The admin can still look the new password up.
    expect(decryptCredential(data.temporaryPassword)).toBe('yangiparol1');
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null, id: { not: 'session-current' } },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(['user-update', 'session-revoke']);
    expect(data.passwordChangedAt).toBeInstanceOf(Date);
  });

  it('lets a student change their password only once per 12 hours', async () => {
    const { service, prisma } = await createService('eskiparol1', { student: { id: 's1' }, passwordChangedAt: new Date(Date.now() - 3 * 3_600_000) });
    await expect(service.changePassword('u1', 'eskiparol1', 'yangiparol1')).rejects.toThrow(/12 soatda faqat bir marta/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets a teacher change again once 12 hours have passed', async () => {
    const { service, prisma } = await createService('eskiparol1', { employee: { teacherProfile: { id: 't1' } }, passwordChangedAt: new Date(Date.now() - 13 * 3_600_000) });
    await service.changePassword('u1', 'eskiparol1', 'yangiparol1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('does not limit staff logins', async () => {
    const { service, prisma } = await createService('eskiparol1', { employee: { teacherProfile: null }, passwordChangedAt: new Date() });
    await service.changePassword('u1', 'eskiparol1', 'yangiparol1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('nextSelfPasswordChange', () => {
  const changed = new Date('2026-10-07T10:00:00Z');
  it('is 12 hours after the last change for a student, then null', () => {
    const student = { passwordChangedAt: changed, student: { id: 's1' } };
    expect(nextSelfPasswordChange(student, new Date('2026-10-07T15:00:00Z'))?.toISOString()).toBe('2026-10-07T22:00:00.000Z');
    expect(nextSelfPasswordChange(student, new Date('2026-10-07T22:00:01Z'))).toBeNull();
  });
  it('is null for a login that never changed its own password', () => {
    expect(nextSelfPasswordChange({ passwordChangedAt: null, student: { id: 's1' } })).toBeNull();
  });
});
