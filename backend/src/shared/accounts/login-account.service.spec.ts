import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { decryptCredential, encryptCredential } from '../security/credential-cipher.js';
import { generatePassword, LoginAccountService } from './login-account.service.js';

function createPrisma(opts: { maxLogin?: number | null; stored?: string | null } = {}) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([{ max: opts.maxLogin ?? null }]),
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'u-new', username: data.username })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'u1', ...data })),
    },
    userSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', username: '10005', temporaryPassword: opts.stored ?? null }) },
    role: { findUnique: vi.fn().mockResolvedValue({ id: 'role1' }) },
    auditLog: { create: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)),
    __tx: tx,
  };
}

const create = (prisma: ReturnType<typeof createPrisma>) =>
  new LoginAccountService(prisma as never).create({ roleName: 'Student', fullName: 'Aziz', preferredEmail: null, link: vi.fn() });

describe('LoginAccountService.create', () => {
  it('gives the first login number 10000 and returns the generated password', async () => {
    const prisma = createPrisma({ maxLogin: null });
    const result = await create(prisma);
    expect(result.username).toBe('10000');
    expect(result.password).toMatch(/^[1-9][0-9]{4}$/);
  });

  it('continues the sequence from the highest number in use, under the advisory lock', async () => {
    const prisma = createPrisma({ maxLogin: 10041 });
    const result = await create(prisma);
    expect(prisma.__tx.$executeRaw).toHaveBeenCalled();
    expect(result.username).toBe('10042');
    expect(prisma.__tx.user.create.mock.calls[0][0].data.email).toBe('10042@accounts.local');
  });

  it('refuses once the range up to 100000 is used up', async () => {
    await expect(create(createPrisma({ maxLogin: 100000 }))).rejects.toThrow(ConflictException);
  });

  it('stores a bcrypt hash for signing in and an encrypted, admin-readable copy — never the plain password', async () => {
    const prisma = createPrisma();
    const result = await create(prisma);
    const { data } = prisma.__tx.user.create.mock.calls[0][0];
    expect(await bcrypt.compare(result.password, data.passwordHash)).toBe(true);
    expect(data.temporaryPassword).not.toContain(result.password);
    expect(decryptCredential(data.temporaryPassword)).toBe(result.password);
  });
});

describe('LoginAccountService.resetPassword / setActive', () => {
  it('sets a new random password, keeps it admin-readable, signs the user out and returns it', async () => {
    const prisma = createPrisma();
    const result = await new LoginAccountService(prisma as never).resetPassword('u1');
    const { data } = prisma.__tx.user.update.mock.calls[0][0];
    expect(decryptCredential(data.temporaryPassword)).toBe(result.password);
    expect(prisma.__tx.userSession.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it('404s when there is no login to reset', async () => {
    await expect(new LoginAccountService(createPrisma() as never).resetPassword(null)).rejects.toThrow(NotFoundException);
  });

  it('blocking suspends and signs out; unblocking only reactivates', async () => {
    const prisma = createPrisma();
    await new LoginAccountService(prisma as never).setActive('u1', false);
    expect(prisma.__tx.user.update.mock.calls[0][0].data).toEqual({ status: 'SUSPENDED' });
    expect(prisma.__tx.userSession.updateMany).toHaveBeenCalledTimes(1);

    const prisma2 = createPrisma();
    await new LoginAccountService(prisma2 as never).setActive('u1', true);
    expect(prisma2.__tx.user.update.mock.calls[0][0].data).toEqual({ status: 'ACTIVE' });
    expect(prisma2.__tx.userSession.updateMany).not.toHaveBeenCalled();
  });
});

describe('LoginAccountService.remove', () => {
  function removable(counts: Partial<Record<'payment' | 'tuitionAllocation' | 'assessment' | 'studentAttendance' | 'homework' | 'extraLesson', number>> = {}) {
    const tx = {
      user: { delete: vi.fn().mockResolvedValue({ id: 'u1', username: '10005', fullName: 'Aziz' }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const count = (key: keyof typeof counts) => ({ count: vi.fn().mockResolvedValue(counts[key] ?? 0) });
    const prisma = {
      payment: count('payment'),
      tuitionAllocation: count('tuitionAllocation'),
      assessment: count('assessment'),
      studentAttendance: count('studentAttendance'),
      homework: count('homework'),
      extraLesson: count('extraLesson'),
      $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };
    return { service: new LoginAccountService(prisma as never), tx };
  }

  it('deletes the login and audits who did it (without any password)', async () => {
    const { service, tx } = removable();
    await expect(service.remove('u1', { id: 'admin1', username: 'admin' })).resolves.toEqual({ id: 'u1', username: '10005' });
    expect(tx.user.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'admin1', action: 'LOGIN_DELETE', entityId: 'u1' }) });
  });

  it('refuses while the login authored payments / grades / attendance / homework', async () => {
    const { service, tx } = removable({ studentAttendance: 3 });
    await expect(service.remove('u1', { id: 'admin1', username: 'admin' })).rejects.toThrow(ConflictException);
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it('404s when there is no login', async () => {
    await expect(removable().service.remove(null, { id: 'admin1', username: 'admin' })).rejects.toThrow(NotFoundException);
  });
});

describe('LoginAccountService.reveal', () => {
  it('decrypts the stored password and audits the look-up WITHOUT the password', async () => {
    const prisma = createPrisma({ stored: encryptCredential('Kx7mPq2a') });
    const result = await new LoginAccountService(prisma as never).reveal('u1', { id: 'admin1', username: 'admin' }, '127.0.0.1');
    expect(result).toEqual({ userId: 'u1', username: '10005', password: 'Kx7mPq2a' });
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ actorUserId: 'admin1', action: 'CREDENTIALS_VIEW', entityId: 'u1' });
    expect(JSON.stringify(audit)).not.toContain('Kx7mPq2a');
  });

  it('audits repeated look-ups (the live-refreshing UI) only once per window', async () => {
    const prisma = createPrisma({ stored: encryptCredential('Kx7mPq2a') });
    prisma.auditLog.findFirst.mockResolvedValue({ id: 'recent' });
    const result = await new LoginAccountService(prisma as never).reveal('u1', { id: 'admin1', username: 'admin' });
    expect(result.password).toBe('Kx7mPq2a');
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns null when no readable copy exists', async () => {
    const prisma = createPrisma({ stored: null });
    expect((await new LoginAccountService(prisma as never).reveal('u1', { id: 'admin1', username: 'admin' })).password).toBeNull();
  });
});

describe('generatePassword', () => {
  it('is always a number from 10000 to 99999', () => {
    for (let i = 0; i < 500; i++) {
      const value = Number(generatePassword());
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(10000);
      expect(value).toBeLessThanOrEqual(99999);
    }
  });
});
