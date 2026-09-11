import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateCourseDto } from './dto/create-course.dto.js';
import { QueryCourseDto } from './dto/query-course.dto.js';
import { UpdateCourseDto } from './dto/update-course.dto.js';
import { CoursesService } from './courses.service.js';

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @RequirePermission('courses', PermissionAction.VIEW)
  findAll(@Query() query: QueryCourseDto) {
    return this.coursesService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('courses', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.coursesService.findOne(id);
  }

  @Post()
  @RequirePermission('courses', PermissionAction.CREATE)
  @Audited('Course')
  create(@Body() dto: CreateCourseDto) {
    return this.coursesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('courses', PermissionAction.EDIT)
  @Audited('Course')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCourseDto) {
    return this.coursesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('courses', PermissionAction.DELETE)
  @Audited('Course', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.coursesService.remove(id);
  }
}
