import { Global, Module } from '@nestjs/common';
import { RolePermissionsCacheService } from './role-permissions-cache.service.js';

@Global()
@Module({
  providers: [RolePermissionsCacheService],
  exports: [RolePermissionsCacheService],
})
export class RolePermissionsCacheModule {}
