import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { SetLoginActiveDto } from '../../shared/accounts/login-account.dto.js';
import { LoginAccountService } from '../../shared/accounts/login-account.service.js';
import type { AuthenticatedRequest, AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly logins: LoginAccountService,
  ) {}

  @Get()
  @RequirePermission('users', PermissionAction.VIEW)
  findAll() {
    return this.usersService.findAll();
  }

  /** Admin-only: the password staff last set for this login (null if the user chose their own). Each look-up is audited by LoginAccountService. */
  @Get(':id/credentials')
  @RequirePermission('credentials', PermissionAction.VIEW)
  credentials(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: AuthenticatedRequest) {
    return this.logins.reveal(id, user, req.ip);
  }

  /** A new random password for this login, returned so it can be handed over. */
  @Post(':id/reset-password')
  @RequirePermission('users', PermissionAction.EDIT)
  @Audited('User', 'PASSWORD_RESET')
  resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.logins.resetPassword(id);
  }

  @Patch(':id/login')
  @RequirePermission('users', PermissionAction.EDIT)
  @Audited('User', 'LOGIN_UPDATE')
  setLoginActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetLoginActiveDto) {
    return this.logins.setActive(id, dto.active);
  }

  @Get(':id')
  @RequirePermission('users', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @RequirePermission('users', PermissionAction.CREATE)
  @Audited('User')
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('users', PermissionAction.EDIT)
  @Audited('User')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('users', PermissionAction.DELETE)
  @Audited('User', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }
}
