import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreatePositionDto } from './dto/create-position.dto.js';
import { QueryPositionDto } from './dto/query-position.dto.js';
import { UpdatePositionDto } from './dto/update-position.dto.js';
import { PositionsService } from './positions.service.js';

@ApiTags('positions')
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get()
  @RequirePermission('positions', PermissionAction.VIEW)
  findAll(@Query() query: QueryPositionDto) {
    return this.positionsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('positions', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.positionsService.findOne(id);
  }

  @Post()
  @RequirePermission('positions', PermissionAction.CREATE)
  @Audited('Position')
  create(@Body() dto: CreatePositionDto) {
    return this.positionsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('positions', PermissionAction.EDIT)
  @Audited('Position')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePositionDto) {
    return this.positionsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('positions', PermissionAction.DELETE)
  @Audited('Position', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.positionsService.remove(id);
  }
}
