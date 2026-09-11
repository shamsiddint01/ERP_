import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateClassroomDto } from './dto/create-classroom.dto.js';
import { QueryClassroomDto } from './dto/query-classroom.dto.js';
import { UpdateClassroomDto } from './dto/update-classroom.dto.js';
import { ClassroomsService } from './classrooms.service.js';

@ApiTags('classrooms')
@Controller('classrooms')
export class ClassroomsController {
  constructor(private readonly classroomsService: ClassroomsService) {}

  @Get()
  @RequirePermission('classrooms', PermissionAction.VIEW)
  findAll(@Query() query: QueryClassroomDto) {
    return this.classroomsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('classrooms', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.classroomsService.findOne(id);
  }

  @Post()
  @RequirePermission('classrooms', PermissionAction.CREATE)
  @Audited('Classroom')
  create(@Body() dto: CreateClassroomDto) {
    return this.classroomsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('classrooms', PermissionAction.EDIT)
  @Audited('Classroom')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClassroomDto) {
    return this.classroomsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('classrooms', PermissionAction.DELETE)
  @Audited('Classroom', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.classroomsService.remove(id);
  }
}
