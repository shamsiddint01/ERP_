import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { AccountsService } from './accounts.service.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { QueryAccountDto } from './dto/query-account.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @RequirePermission('finance', PermissionAction.VIEW)
  findAll(@Query() query: QueryAccountDto) {
    return this.accountsService.findAll(query);
  }

  @Get('tree')
  @RequirePermission('finance', PermissionAction.VIEW)
  findTree() {
    return this.accountsService.findTree();
  }

  @Get(':id')
  @RequirePermission('finance', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.findOne(id);
  }

  @Post()
  @RequirePermission('finance', PermissionAction.CREATE)
  @Audited('Account')
  create(@Body() dto: CreateAccountDto) {
    return this.accountsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('finance', PermissionAction.EDIT)
  @Audited('Account')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountDto) {
    return this.accountsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('finance', PermissionAction.EDIT)
  @Audited('Account', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.remove(id);
  }
}
