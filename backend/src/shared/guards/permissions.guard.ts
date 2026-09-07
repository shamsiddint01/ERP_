import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { permissionKey } from '../constants/permission-modules.constant.js';
import { REQUIRED_PERMISSION_KEY, type RequiredPermission } from '../decorators/require-permission.decorator.js';
import { RolePermissionsCacheService } from '../rbac/role-permissions-cache.service.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsCache: RolePermissionsCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(REQUIRED_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException();

    const grantedPermissions = await this.permissionsCache.getPermissionsForRole(request.user.roleId);
    const requiredKey = permissionKey(required.module, required.action);
    if (!grantedPermissions.includes(requiredKey)) {
      throw new ForbiddenException(`Missing permission: ${requiredKey}`);
    }
    return true;
  }
}
