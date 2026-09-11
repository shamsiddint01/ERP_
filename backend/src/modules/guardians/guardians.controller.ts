import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateGuardianDto } from './dto/create-guardian.dto.js';
import { QueryGuardianDto } from './dto/query-guardian.dto.js';
import { UpdateGuardianDto } from './dto/update-guardian.dto.js';
import { GuardiansService } from './guardians.service.js';

@ApiTags('guardians')
@Controller('guardians')
export class GuardiansController {
  constructor(private readonly guardiansService: GuardiansService) {}

  @Get()
  @RequirePermission('guardians', PermissionAction.VIEW)
  findAll(@Query() query: QueryGuardianDto) {
    return this.guardiansService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('guardians', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardiansService.findOne(id);
  }

  @Post()
  @RequirePermission('guardians', PermissionAction.CREATE)
  @Audited('Guardian')
  create(@Body() dto: CreateGuardianDto) {
    return this.guardiansService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('guardians', PermissionAction.EDIT)
  @Audited('Guardian')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGuardianDto) {
    return this.guardiansService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('guardians', PermissionAction.DELETE)
  @Audited('Guardian', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardiansService.remove(id);
  }
}
