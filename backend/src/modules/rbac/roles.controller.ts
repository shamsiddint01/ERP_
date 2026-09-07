import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { PERMISSION_MODULES } from '../../shared/constants/permission-modules.constant.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto.js';
import { RolesService } from './roles.service.js';

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('permissions/catalog')
  @RequirePermission('roles', PermissionAction.VIEW)
  getPermissionCatalog() {
    return PERMISSION_MODULES;
  }

  @Get()
  @RequirePermission('roles', PermissionAction.VIEW)
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @RequirePermission('roles', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequirePermission('roles', PermissionAction.CREATE)
  @Audited('Role')
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('roles', PermissionAction.EDIT)
  @Audited('Role')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Put(':id/permissions')
  @RequirePermission('roles', PermissionAction.EDIT)
  @Audited('Role', 'UPDATE_PERMISSIONS')
  updatePermissions(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRolePermissionsDto) {
    return this.rolesService.updatePermissions(id, dto);
  }

  @Delete(':id')
  @RequirePermission('roles', PermissionAction.DELETE)
  @Audited('Role')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.remove(id);
  }
}
