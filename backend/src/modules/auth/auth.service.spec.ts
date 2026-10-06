import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

async function createService(currentPassword = 'eskiparol1') {
  const passwordHash = await bcrypt.hash(currentPassword, 4);
  const prisma = {
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1', passwordHash }), update: vi.fn().mockReturnValue('user-update') },
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

  it('stores a new hash and revokes every OTHER session, keeping the current device signed in', async () => {
    const { service, prisma } = await createService();
    await service.changePassword('u1', 'eskiparol1', 'yangiparol1', 'session-current.secret');

    const { data } = prisma.user.update.mock.calls[0][0];
    expect(await bcrypt.compare('yangiparol1', data.passwordHash)).toBe(true);
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null, id: { not: 'session-current' } },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(['user-update', 'session-revoke']);
  });
});
