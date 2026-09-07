import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { RolePermissionsCacheService } from '../../shared/rbac/role-permissions-cache.service.js';
import type { CreateRoleDto } from './dto/create-role.dto.js';
import type { UpdateRoleDto } from './dto/update-role.dto.js';
import type { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto.js';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsCache: RolePermissionsCacheService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Role', (id) => this.prisma.role.findUnique({ where: { id } }));
  }

  findAll() {
    return this.prisma.role.findMany({
      include: { _count: { select: { users: true, rolePermissions: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  create(dto: CreateRoleDto) {
    return this.prisma.role.create({ data: { name: dto.name, description: dto.description } });
  }

  async update(id: string, dto: UpdateRoleDto) {
    await this.assertExists(id);
    return this.prisma.role.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const role = await this.assertExists(id);
    if (role.isSystemRole) throw new BadRequestException('System roles cannot be deleted');

    const usersWithRole = await this.prisma.user.count({ where: { roleId: id, deletedAt: null } });
    if (usersWithRole > 0) throw new ConflictException('Cannot delete a role that is still assigned to users');

    await this.prisma.role.delete({ where: { id } });
  }

  /** Replaces a role's entire permission set in one transaction, then busts the Redis cache. */
  async updatePermissions(id: string, dto: UpdateRolePermissionsDto) {
    await this.assertExists(id);

    const resolvedPermissions = await this.prisma.permission.findMany({
      where: { OR: dto.permissions.map((p) => ({ module: p.module, action: p.action })) },
    });
    if (resolvedPermissions.length !== dto.permissions.length) {
      throw new BadRequestException('One or more permissions do not exist for the given module/action');
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: resolvedPermissions.map((permission) => ({ roleId: id, permissionId: permission.id })),
      }),
    ]);

    await this.permissionsCache.invalidate(id);
    return this.findOne(id);
  }

  private async assertExists(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }
}
