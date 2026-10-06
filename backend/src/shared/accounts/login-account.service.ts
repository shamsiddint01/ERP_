import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service.js';

const PASSWORD_SALT_ROUNDS = 10;

export const LOGIN_ACCOUNT_SELECT = { id: true, username: true, status: true, lastActiveAt: true, createdAt: true } satisfies Prisma.UserSelect;

export interface CreateLoginInput {
  roleName: string;
  fullName: string;
  /** Used as the login's email when no other user has it yet; otherwise an internal placeholder is used. */
  preferredEmail: string | null;
  username: string;
  password: string;
  /** Links the new user to its owner (student / teacher) inside the same transaction. */
  link: (tx: Prisma.TransactionClient, userId: string) => Promise<unknown>;
}

/**
 * Shared mechanics of a person's login (students and teachers): staff type
 * the username and password themselves, can set a new password and can
 * block / unblock it. A new password or a block signs the user out of every
 * device. Passwords are only ever stored as a bcrypt hash.
 */
@Injectable()
export class LoginAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateLoginInput) {
    const username = input.username.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { username } })) throw new ConflictException('Bu login band');

    const role = await this.prisma.role.findUnique({ where: { name: input.roleName } });
    if (!role) throw new InternalServerErrorException(`"${input.roleName}" roli topilmadi — seed ishga tushirilmagan`);

    // User.email is required and unique: use the person's own email when it's free, otherwise an internal placeholder.
    const emailTaken = input.preferredEmail ? await this.prisma.user.findUnique({ where: { email: input.preferredEmail } }) : null;
    const email = input.preferredEmail && !emailTaken ? input.preferredEmail : `${username}@accounts.local`;

    const passwordHash = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { fullName: input.fullName, email, username, passwordHash, roleId: role.id, status: 'ACTIVE' },
        select: LOGIN_ACCOUNT_SELECT,
      });
      await input.link(tx, user.id);
      return user;
    });
  }

  async update(userId: string | null | undefined, dto: { password?: string; active?: boolean }) {
    if (!userId) throw new NotFoundException("Login yo'q");
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS) : undefined;
    const status = dto.active === undefined ? undefined : dto.active ? 'ACTIVE' : 'SUSPENDED';
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { ...(passwordHash && { passwordHash }), ...(status && { status }) },
        select: LOGIN_ACCOUNT_SELECT,
      });
      if (passwordHash || status === 'SUSPENDED') {
        await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      return user;
    });
  }
}
