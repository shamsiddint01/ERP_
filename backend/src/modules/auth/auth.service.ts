import { randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RolePermissionsCacheService } from '../../shared/rbac/role-permissions-cache.service.js';
import { encryptCredential } from '../../shared/security/credential-cipher.js';
import { parseDurationMs } from '../../shared/utils/duration.util.js';
import type { LoginDto } from './dto/login.dto.js';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly permissionsCache: RolePermissionsCacheService,
  ) {}

  async login(dto: LoginDto, ctx: RequestContext) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: { role: true },
    });

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid username or password');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    const tokens = await this.issueTokenPair(user.id, ctx);
    return {
      ...tokens,
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role.name,
      },
    };
  }

  async refresh(refreshToken: string, ctx: RequestContext): Promise<TokenPair> {
    const [sessionId, secret] = refreshToken.split('.');
    if (!sessionId || !secret) throw new UnauthorizedException('Invalid refresh token');

    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired or revoked');
    }

    const secretValid = await bcrypt.compare(secret, session.refreshTokenHash);
    if (!secretValid) {
      // Reused/forged token against a still-live session: revoke it defensively.
      await this.prisma.userSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
      throw new ForbiddenException('Refresh token reuse detected');
    }

    await this.prisma.userSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    return this.issueTokenPair(session.userId, ctx);
  }

  async logout(refreshToken: string): Promise<void> {
    const [sessionId] = refreshToken.split('.');
    if (!sessionId) return;
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { role: true, student: { select: { id: true } }, employee: { select: { teacherProfile: { select: { id: true, status: true } } } } },
    });
    const permissions = await this.permissionsCache.getPermissionsForRole(user.roleId);

    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role.name,
      status: user.status,
      lastActiveAt: user.lastActiveAt,
      permissions,
      /** Set when this login belongs to a student — the frontend then shows the student portal instead of the staff app. */
      studentId: user.student?.id ?? null,
      /** Set when this login belongs to an active teacher — together with the Teacher role, the frontend shows the teacher cabinet. */
      teacherProfileId: user.employee?.teacherProfile?.status === 'ACTIVE' ? user.employee.teacherProfile.id : null,
    };
  }

  /**
   * Self-service password change. Every other session of this user is
   * revoked, so a password that leaked is useless everywhere else at once —
   * the current device stays signed in. The new password is also kept
   * encrypted so an admin can still look it up if the user forgets it.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string, currentRefreshToken?: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException("Joriy parol noto'g'ri");
    }
    if (currentPassword === newPassword) throw new BadRequestException('Yangi parol eskisidan farq qilishi kerak');

    const currentSessionId = currentRefreshToken?.split('.')[0];
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 10), temporaryPassword: encryptCredential(newPassword) } }),
      this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null, ...(currentSessionId && { id: { not: currentSessionId } }) },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async issueTokenPair(userId: string, ctx: RequestContext): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as JwtSignOptions['expiresIn'],
      },
    );

    const sessionId = randomUUID();
    const secret = randomBytes(48).toString('hex');
    const refreshTokenHash = await bcrypt.hash(secret, 10);
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const refreshTokenExpiresAt = new Date(Date.now() + parseDurationMs(refreshExpiresIn));

    await this.prisma.userSession.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash,
        userAgent: ctx.userAgent,
        ipAddress: ctx.ipAddress,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: `${sessionId}.${secret}`,
      refreshTokenExpiresAt,
    };
  }
}
