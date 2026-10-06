import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LoginAccountService } from '../../shared/accounts/login-account.service.js';
import { TeacherAccountService } from './teacher-account.service.js';

function createPrisma(employeeUser: { id: string } | null = null, profileExists = true) {
  const tx = {
    user: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'u-new', ...data })),
      update: vi.fn().mockResolvedValue({ id: 'u-new' }),
    },
    userSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  return {
    teacherProfile: {
      findUnique: vi.fn().mockResolvedValue(profileExists ? { employee: { id: 'emp1', fullName: 'Sarvinoz T.', email: null, user: employeeUser } } : null),
    },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    role: { findUnique: vi.fn().mockResolvedValue({ id: 'role-teacher' }) },
    $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)),
    __tx: tx,
  };
}

const service = (prisma: ReturnType<typeof createPrisma>) => new TeacherAccountService(prisma as never, new LoginAccountService(prisma as never));

describe('TeacherAccountService', () => {
  it('creates a Teacher-role login and links it to the teacher\'s employee record', async () => {
    const prisma = createPrisma();
    await service(prisma).create('tp1', { username: 'sarvinoz', password: 'parol1234' });
    expect(prisma.role.findUnique).toHaveBeenCalledWith({ where: { name: 'Teacher' } });
    expect(prisma.__tx.user.create.mock.calls[0][0].data).toMatchObject({ username: 'sarvinoz', roleId: 'role-teacher', email: 'sarvinoz@accounts.local' });
    expect(prisma.__tx.user.update).toHaveBeenCalledWith({ where: { id: 'u-new' }, data: { employeeId: 'emp1' } });
  });

  it('refuses a second login for the same teacher', async () => {
    await expect(service(createPrisma({ id: 'u1' })).create('tp1', { username: 'x12', password: 'parol1234' })).rejects.toThrow(ConflictException);
  });

  it('404s for an unknown teacher, and when updating a teacher that has no login', async () => {
    await expect(service(createPrisma(null, false)).get('missing')).rejects.toThrow(NotFoundException);
    await expect(service(createPrisma(null)).update('tp1', { password: 'yangiparol1' })).rejects.toThrow(NotFoundException);
  });
});
