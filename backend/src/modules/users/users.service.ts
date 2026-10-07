import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { sanitizeEntity } from '../../shared/audit/diff-fields.util.js';
import { encryptCredential } from '../../shared/security/credential-cipher.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';

const PASSWORD_SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('User', (id) => this.prisma.user.findUnique({ where: { id } }));
  }

  /** Every login, with who it belongs to; `hasVisiblePassword` says whether a readable copy of its password exists (the value itself is never listed). */
  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      include: {
        role: { select: { id: true, name: true } },
        student: { select: { id: true, studentCode: true } },
        employee: { select: { id: true, employeeCode: true, teacherProfile: { select: { id: true } } } },
      },
      orderBy: [{ role: { name: 'asc' } }, { username: 'asc' }],
    });
    return users.map((user) => ({ ...this.sanitize(user), hasVisiblePassword: user.temporaryPassword !== null }));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: { select: { id: true, name: true } } },
    });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    });
    if (existing) throw new ConflictException('Username or email already in use');
    if (dto.employeeId) await this.assertEmployeeLinkable(dto.employeeId);

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);
    try {
      const user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
          username: dto.username,
          passwordHash,
          temporaryPassword: encryptCredential(dto.password),
          roleId: dto.roleId,
          employeeId: dto.employeeId,
          avatarUrl: dto.avatarUrl,
          status: 'ACTIVE',
        },
        include: { role: { select: { id: true, name: true } } },
      });
      return this.sanitize(user);
    } catch (error) {
      throw this.translateEmployeeLinkError(error);
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    if (dto.employeeId) await this.assertEmployeeLinkable(dto.employeeId);

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS) : undefined;
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
          roleId: dto.roleId,
          employeeId: dto.employeeId,
          avatarUrl: dto.avatarUrl,
          status: dto.status,
          ...(passwordHash ? { passwordHash, temporaryPassword: encryptCredential(dto.password!) } : {}),
        },
        include: { role: { select: { id: true, name: true } } },
      });
      return this.sanitize(user);
    } catch (error) {
      throw this.translateEmployeeLinkError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
      include: { role: { select: { id: true, name: true } } },
    });
    return this.sanitize(user);
  }

  private sanitize<T extends Record<string, unknown>>(user: T) {
    return sanitizeEntity(user);
  }

  private async assertEmployeeLinkable(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.deletedAt) throw new NotFoundException('Employee not found');
  }

  private translateEmployeeLinkError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('This employee is already linked to another user account');
    }
    return error;
  }
}
