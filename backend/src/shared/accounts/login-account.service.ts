import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decryptCredential, encryptCredential } from '../security/credential-cipher.js';

const PASSWORD_SALT_ROUNDS = 10;

/** Logins are handed out as sequential numbers in this range: 10000, 10001, ... 100000. */
export const LOGIN_NUMBER_MIN = 10000;
export const LOGIN_NUMBER_MAX = 100000;

/**
 * Passwords are a random 5-digit number, 10000–99999 — easy to read out and
 * type on a phone. Guessing is held back by the login endpoint's rate limit
 * (10 attempts per minute per IP, see AuthController).
 */
export const PASSWORD_MIN = 10000;
export const PASSWORD_MAX = 99999;

/** Repeat look-ups of the same login by the same admin within this window are audited once. */
const VIEW_AUDIT_WINDOW_MS = 30 * 60_000;

export const LOGIN_ACCOUNT_SELECT = { id: true, username: true, status: true, lastActiveAt: true, createdAt: true } satisfies Prisma.UserSelect;

export function generatePassword(): string {
  return String(randomInt(PASSWORD_MIN, PASSWORD_MAX + 1));
}

export interface CreateLoginInput {
  roleName: string;
  fullName: string;
  /** Used as the login's email when no other user has it yet; otherwise an internal placeholder is used. */
  preferredEmail: string | null;
  /** Links the new user to its owner (student / teacher) inside the same transaction. */
  link: (tx: Prisma.TransactionClient, userId: string) => Promise<unknown>;
}

/**
 * Shared mechanics of a person's login (students, teachers, staff). The
 * system assigns both parts: the login is the next free number from 10000 up,
 * the password is a random 5-digit number. The bcrypt hash is what signing in checks; an
 * AES-encrypted copy of the current password is kept so an admin can always
 * look it up (reveal()) when someone loses it. A new password or a block
 * signs the user out of every device.
 */
@Injectable()
export class LoginAccountService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the login and returns it together with its password, so the creator can hand both over. */
  async create(input: CreateLoginInput) {
    const role = await this.prisma.role.findUnique({ where: { name: input.roleName } });
    if (!role) throw new InternalServerErrorException(`"${input.roleName}" roli topilmadi — seed ishga tushirilmagan`);

    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    const user = await this.prisma.$transaction(async (tx) => {
      const username = await this.nextLoginNumber(tx);
      // User.email is required and unique: use the person's own email when it's free, otherwise an internal placeholder.
      const emailTaken = input.preferredEmail ? await tx.user.findUnique({ where: { email: input.preferredEmail } }) : null;
      const email = input.preferredEmail && !emailTaken ? input.preferredEmail : `${username}@accounts.local`;
      const created = await tx.user.create({
        data: { fullName: input.fullName, email, username, passwordHash, temporaryPassword: encryptCredential(password), roleId: role.id, status: 'ACTIVE' },
        select: LOGIN_ACCOUNT_SELECT,
      });
      await input.link(tx, created.id);
      return created;
    });
    return { ...user, password };
  }

  /** Replaces the password with a new random one (signing the user out everywhere) and returns it. */
  async resetPassword(userId: string | null | undefined) {
    if (!userId) throw new NotFoundException("Login yo'q");
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { passwordHash, temporaryPassword: encryptCredential(password) },
        select: LOGIN_ACCOUNT_SELECT,
      });
      await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return updated;
    });
    return { ...user, password };
  }

  /** Blocking also signs the user out of every device. */
  async setActive(userId: string | null | undefined, active: boolean) {
    if (!userId) throw new NotFoundException("Login yo'q");
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id: userId }, data: { status: active ? 'ACTIVE' : 'SUSPENDED' }, select: LOGIN_ACCOUNT_SELECT });
      if (!active) await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return user;
    });
  }

  /**
   * The login's current password, for an admin to read (null only when no
   * readable copy exists, e.g. a login created before this feature). Every
   * look-up is written to the audit log (once per admin and login per 30
   * minutes), without the password itself.
   */
  async reveal(userId: string, actor: { id: string; username: string }, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, temporaryPassword: true } });
    if (!user) throw new NotFoundException('User not found');
    const password = decryptCredential(user.temporaryPassword);
    // The admin UI keeps a shown password live (re-fetching every few seconds) —
    // one audit row per admin, per login, per window is enough, not one per poll.
    const recentlyLogged = await this.prisma.auditLog.findFirst({
      where: { actorUserId: actor.id, action: 'CREDENTIALS_VIEW', entityType: 'User', entityId: user.id, createdAt: { gte: new Date(Date.now() - VIEW_AUDIT_WINDOW_MS) } },
      select: { id: true },
    });
    if (!recentlyLogged) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREDENTIALS_VIEW',
          entityType: 'User',
          entityId: user.id,
          description: `${actor.username} viewed the password of ${user.username}`,
          ipAddress,
        },
      });
    }
    return { userId: user.id, username: user.username, password };
  }

  /** The next free number in [LOGIN_NUMBER_MIN, LOGIN_NUMBER_MAX], serialised so two staff creating logins at once never get the same one. */
  private async nextLoginNumber(tx: Prisma.TransactionClient): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('login_number'))`;
    // CASE (not AND): Postgres may evaluate AND operands in any order, and the cast must never see a non-numeric username.
    const [row] = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(username::int) AS max FROM users
      WHERE CASE WHEN username ~ '^[0-9]{5,6}$' THEN username::int BETWEEN ${LOGIN_NUMBER_MIN} AND ${LOGIN_NUMBER_MAX} ELSE false END`;
    const next = row?.max == null ? LOGIN_NUMBER_MIN : Number(row.max) + 1;
    if (next > LOGIN_NUMBER_MAX) throw new ConflictException(`Login raqamlari tugadi (${LOGIN_NUMBER_MAX} gacha)`);
    return String(next);
  }
}
