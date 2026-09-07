import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { permissionKey } from '../constants/permission-modules.constant.js';

const CACHE_TTL_SECONDS = 3600;

function cacheKey(roleId: string): string {
  return `role-permissions:${roleId}`;
}

/**
 * Resolves a role's flat "module:action" permission set, cached in Redis so
 * PermissionsGuard doesn't hit Postgres on every request. Cache is
 * invalidated explicitly whenever an admin edits a role's permissions
 * (see RolesService.updatePermissions) rather than relying on the TTL alone.
 */
@Injectable()
export class RolePermissionsCacheService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getPermissionsForRole(roleId: string): Promise<string[]> {
    const cached = await this.redis.client.get(cacheKey(roleId));
    if (cached) return JSON.parse(cached) as string[];

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    const permissions = rolePermissions.map((rp) => permissionKey(rp.permission.module, rp.permission.action));

    await this.redis.client.set(cacheKey(roleId), JSON.stringify(permissions), 'EX', CACHE_TTL_SECONDS);
    return permissions;
  }

  async invalidate(roleId: string): Promise<void> {
    await this.redis.client.del(cacheKey(roleId));
  }
}
