import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TeacherAccountService } from './teacher-account.service.js';

function setup(employeeUser: { id: string } | null = null, profileExists = true) {
  const prisma = {
    teacherProfile: {
      findUnique: vi.fn().mockResolvedValue(profileExists ? { employee: { id: 'emp1', fullName: 'Sarvinoz T.', email: null, user: employeeUser } } : null),
    },
  };
  const logins = {
    create: vi.fn().mockResolvedValue({ id: 'u-new', username: '10001', password: 'Kx7mPq2a' }),
    resetPassword: vi.fn().mockResolvedValue({ id: 'u1', password: 'New12345' }),
    setActive: vi.fn().mockResolvedValue({ id: 'u1' }),
  };
  return { service: new TeacherAccountService(prisma as never, logins as never), logins };
}

describe('TeacherAccountService', () => {
  it("creates a Teacher-role login and links it to the teacher's employee record", async () => {
    const { service, logins } = setup();
    await service.create('tp1');
    const input = logins.create.mock.calls[0][0];
    expect(input).toMatchObject({ roleName: 'Teacher', fullName: 'Sarvinoz T.' });
    const tx = { user: { update: vi.fn() } };
    await input.link(tx, 'u-new');
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u-new' }, data: { employeeId: 'emp1' } });
  });

  it('refuses a second login for the same teacher', async () => {
    await expect(setup({ id: 'u1' }).service.create('tp1')).rejects.toThrow(ConflictException);
  });

  it('404s for an unknown teacher', async () => {
    await expect(setup(null, false).service.get('missing')).rejects.toThrow(NotFoundException);
  });

  it("resets the teacher's own login password", async () => {
    const { service, logins } = setup({ id: 'u1' });
    await service.resetPassword('tp1');
    expect(logins.resetPassword).toHaveBeenCalledWith('u1');
  });
});
