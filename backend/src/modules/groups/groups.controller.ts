import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateGroupDto } from './dto/create-group.dto.js';
import { QueryGroupDto } from './dto/query-group.dto.js';
import { UpdateGroupDto } from './dto/update-group.dto.js';
import { GroupsService } from './groups.service.js';

@ApiTags('groups')
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @RequirePermission('groups', PermissionAction.VIEW)
  findAll(@Query() query: QueryGroupDto) {
    return this.groupsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('groups', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupsService.findOne(id);
  }

  @Post()
  @RequirePermission('groups', PermissionAction.CREATE)
  @Audited('StudentGroup')
  create(@Body() dto: CreateGroupDto) {
    return this.groupsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('groups', PermissionAction.EDIT)
  @Audited('StudentGroup')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGroupDto) {
    return this.groupsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('groups', PermissionAction.DELETE)
  @Audited('StudentGroup', 'CANCEL')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupsService.remove(id);
  }
}
