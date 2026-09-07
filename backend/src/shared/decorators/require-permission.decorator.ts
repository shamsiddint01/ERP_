import { SetMetadata } from '@nestjs/common';
import type { PermissionAction } from '@prisma/client';
import type { PermissionModule } from '../constants/permission-modules.constant.js';

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';

export interface RequiredPermission {
  module: PermissionModule;
  action: PermissionAction;
}

/** Gates a route behind a module:action permission, enforced by PermissionsGuard. */
export const RequirePermission = (module: PermissionModule, action: PermissionAction) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, { module, action } satisfies RequiredPermission);
