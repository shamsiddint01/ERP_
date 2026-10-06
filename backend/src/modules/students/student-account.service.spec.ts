import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LoginAccountService } from '../../shared/accounts/login-account.service.js';
import { StudentAccountService } from './student-account.service.js';

function createPrisma(opts: { studentUserId?: string | null; usernameTaken?: boolean; emailTaken?: boolean } = {}) {
  const tx = {
    user: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'u-new', ...data })),
      update: vi.fn().mockResolvedValue({ id: 'u1' }),
    },
    student: { update: vi.fn().mockResolvedValue({}) },
    userSession: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
  return {
    student: {
      findUnique: vi.fn().mockImplementation(({ select }) =>
        Promise.resolve(select?.user ? { user: { id: 'u1', username: 'aziz' } } : { id: 'stu1', fullName: 'Aziz Karimov', email: 'aziz@mail.uz', userId: opts.studentUserId ?? null }),
      ),
    },
    user: {
      findUnique: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve((where.username && opts.usernameTaken) || (where.email && opts.emailTaken) ? { id: 'someone' } : null),
      ),
    },
    role: { findUnique: vi.fn().mockResolvedValue({ id: 'role-student' }) },
    $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)),
    __tx: tx,
  };
}

const service = (prisma: ReturnType<typeof createPrisma>) => new StudentAccountService(prisma as never, new LoginAccountService(prisma as never));

describe('StudentAccountService', () => {
  it('creates an ACTIVE Student-role login with a hashed password and links it to the student', async () => {
    const prisma = createPrisma();
    await service(prisma).create('stu1', { username: 'Aziz.K', password: 'parol1234' });
    const { data } = prisma.__tx.user.create.mock.calls[0][0];
    expect(data).toMatchObject({ username: 'aziz.k', roleId: 'role-student', status: 'ACTIVE', email: 'aziz@mail.uz' });
    expect(data.passwordHash).not.toBe('parol1234');
    expect(prisma.__tx.student.update).toHaveBeenCalledWith({ where: { id: 'stu1' }, data: { userId: 'u-new' } });
  });

  it("falls back to a placeholder email when the student's own email is already used by another login", async () => {
    const prisma = createPrisma({ emailTaken: true });
    await service(prisma).create('stu1', { username: 'aziz', password: 'parol1234' });
    expect(prisma.__tx.user.create.mock.calls[0][0].data.email).toBe('aziz@accounts.local');
  });

  it('refuses a username that is already taken', async () => {
    await expect(service(createPrisma({ usernameTaken: true })).create('stu1', { username: 'aziz', password: 'parol1234' })).rejects.toThrow(ConflictException);
  });

  it('refuses a second login for the same student', async () => {
    await expect(service(createPrisma({ studentUserId: 'u1' })).create('stu1', { username: 'aziz', password: 'parol1234' })).rejects.toThrow(ConflictException);
  });

  it('signs the student out everywhere when the password is reset', async () => {
    const prisma = createPrisma();
    await service(prisma).update('stu1', { password: 'yangiparol1' });
    expect(prisma.__tx.userSession.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it('blocking suspends the login and signs it out; unblocking does not touch sessions', async () => {
    const prisma = createPrisma();
    await service(prisma).update('stu1', { active: false });
    expect(prisma.__tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'SUSPENDED' } }));
    expect(prisma.__tx.userSession.updateMany).toHaveBeenCalledTimes(1);

    const prisma2 = createPrisma();
    await service(prisma2).update('stu1', { active: true });
    expect(prisma2.__tx.userSession.updateMany).not.toHaveBeenCalled();
  });
});
