import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { sanitizeEntity } from '../../shared/audit/diff-fields.util.js';
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

  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      include: { role: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => this.sanitize(user));
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

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        username: dto.username,
        passwordHash,
        roleId: dto.roleId,
        employeeId: dto.employeeId,
        avatarUrl: dto.avatarUrl,
        status: 'ACTIVE',
      },
      include: { role: { select: { id: true, name: true } } },
    });
    return this.sanitize(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS) : undefined;
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
        ...(passwordHash ? { passwordHash } : {}),
      },
      include: { role: { select: { id: true, name: true } } },
    });
    return this.sanitize(user);
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
}
