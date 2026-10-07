import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateTeacherDto } from './dto/create-teacher.dto.js';
import { QueryTeacherDto } from './dto/query-teacher.dto.js';
import { UpdateTeacherDto } from './dto/update-teacher.dto.js';
import { SetLoginActiveDto } from '../../shared/accounts/login-account.dto.js';
import { TeacherAccountService } from './teacher-account.service.js';
import { TeachersService } from './teachers.service.js';

@ApiTags('teachers')
@Controller('teachers')
export class TeachersController {
  constructor(
    private readonly teachersService: TeachersService,
    private readonly teacherAccountService: TeacherAccountService,
  ) {}

  @Get()
  @RequirePermission('teachers', PermissionAction.VIEW)
  findAll(@Query() query: QueryTeacherDto) {
    return this.teachersService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('teachers', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.teachersService.findOne(id);
  }

  @Post()
  @RequirePermission('teachers', PermissionAction.CREATE)
  @Audited('TeacherProfile')
  create(@Body() dto: CreateTeacherDto) {
    return this.teachersService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('teachers', PermissionAction.EDIT)
  @Audited('TeacherProfile')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTeacherDto) {
    return this.teachersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('teachers', PermissionAction.DELETE)
  @Audited('TeacherProfile', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.teachersService.remove(id);
  }

  // ---------------------------------------------------------------------------
  // Login — staff type the username/password and give them to the teacher
  // ---------------------------------------------------------------------------

  @Get(':id/account')
  @RequirePermission('teachers', PermissionAction.VIEW)
  getAccount(@Param('id', ParseUUIDPipe) id: string) {
    return this.teacherAccountService.get(id);
  }

  /** The system assigns the login (next number from 10000) and a random password; both are returned so they can be handed over. */
  @Post(':id/account')
  @RequirePermission('teachers', PermissionAction.EDIT)
  @Audited('TeacherProfile', 'ACCOUNT_CREATE')
  createAccount(@Param('id', ParseUUIDPipe) id: string) {
    return this.teacherAccountService.create(id);
  }

  /** A new random password (the old one stops working everywhere), returned so it can be handed over. */
  @Post(':id/account/reset-password')
  @RequirePermission('teachers', PermissionAction.EDIT)
  @Audited('TeacherProfile', 'ACCOUNT_PASSWORD_RESET')
  resetAccountPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.teacherAccountService.resetPassword(id);
  }

  @Patch(':id/account')
  @RequirePermission('teachers', PermissionAction.EDIT)
  @Audited('TeacherProfile', 'ACCOUNT_UPDATE')
  setAccountActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetLoginActiveDto) {
    return this.teacherAccountService.setActive(id, dto.active);
  }
}
