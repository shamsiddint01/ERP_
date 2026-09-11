import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateBranchDto } from './dto/create-branch.dto.js';
import { QueryBranchDto } from './dto/query-branch.dto.js';
import { UpdateBranchDto } from './dto/update-branch.dto.js';
import { BranchesService } from './branches.service.js';

@ApiTags('branches')
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @RequirePermission('branches', PermissionAction.VIEW)
  findAll(@Query() query: QueryBranchDto) {
    return this.branchesService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('branches', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.branchesService.findOne(id);
  }

  @Post()
  @RequirePermission('branches', PermissionAction.CREATE)
  @Audited('Branch')
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('branches', PermissionAction.EDIT)
  @Audited('Branch')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('branches', PermissionAction.DELETE)
  @Audited('Branch', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.branchesService.remove(id);
  }
}
