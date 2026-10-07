import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StudentAccountService } from './student-account.service.js';

function setup(opts: { studentUserId?: string | null; account?: { id: string } | null; studentExists?: boolean } = {}) {
  const prisma = {
    student: {
      findUnique: vi.fn().mockImplementation(({ select }) => {
        if (opts.studentExists === false) return Promise.resolve(null);
        return Promise.resolve(select?.user ? { user: opts.account ?? null } : { fullName: 'Aziz Karimov', email: 'aziz@mail.uz', userId: opts.studentUserId ?? null });
      }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const logins = {
    create: vi.fn().mockResolvedValue({ id: 'u-new', username: '10000', password: 'Kx7mPq2a' }),
    resetPassword: vi.fn().mockResolvedValue({ id: 'u1', password: 'New12345' }),
    setActive: vi.fn().mockResolvedValue({ id: 'u1' }),
  };
  return { service: new StudentAccountService(prisma as never, logins as never), prisma, logins };
}

describe('StudentAccountService', () => {
  it('creates a Student-role login and links it to the student inside the same transaction', async () => {
    const { service, logins } = setup();
    const result = await service.create('stu1');
    expect(result).toMatchObject({ username: '10000', password: 'Kx7mPq2a' });
    const input = logins.create.mock.calls[0][0];
    expect(input).toMatchObject({ roleName: 'Student', fullName: 'Aziz Karimov', preferredEmail: 'aziz@mail.uz' });
    const tx = { student: { update: vi.fn() } };
    await input.link(tx, 'u-new');
    expect(tx.student.update).toHaveBeenCalledWith({ where: { id: 'stu1' }, data: { userId: 'u-new' } });
  });

  it('refuses a second login for the same student', async () => {
    await expect(setup({ studentUserId: 'u1' }).service.create('stu1')).rejects.toThrow(ConflictException);
  });

  it('404s for an unknown student', async () => {
    await expect(setup({ studentExists: false }).service.create('missing')).rejects.toThrow(NotFoundException);
  });

  it('resets the password / blocks through the student\'s own login', async () => {
    const { service, logins } = setup({ account: { id: 'u1' } });
    await service.resetPassword('stu1');
    await service.setActive('stu1', false);
    expect(logins.resetPassword).toHaveBeenCalledWith('u1');
    expect(logins.setActive).toHaveBeenCalledWith('u1', false);
  });
});
