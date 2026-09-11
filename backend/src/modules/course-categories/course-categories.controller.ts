import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateCourseCategoryDto } from './dto/create-course-category.dto.js';
import { QueryCourseCategoryDto } from './dto/query-course-category.dto.js';
import { UpdateCourseCategoryDto } from './dto/update-course-category.dto.js';
import { CourseCategoriesService } from './course-categories.service.js';

/** Reuses the `courses` permission module — no dedicated permission key exists for categories (Phase C spec §26 allows this). */
@ApiTags('course-categories')
@Controller('course-categories')
export class CourseCategoriesController {
  constructor(private readonly courseCategoriesService: CourseCategoriesService) {}

  @Get()
  @RequirePermission('courses', PermissionAction.VIEW)
  findAll(@Query() query: QueryCourseCategoryDto) {
    return this.courseCategoriesService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('courses', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.courseCategoriesService.findOne(id);
  }

  @Post()
  @RequirePermission('courses', PermissionAction.CREATE)
  @Audited('CourseCategory')
  create(@Body() dto: CreateCourseCategoryDto) {
    return this.courseCategoriesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('courses', PermissionAction.EDIT)
  @Audited('CourseCategory')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCourseCategoryDto) {
    return this.courseCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('courses', PermissionAction.DELETE)
  @Audited('CourseCategory', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.courseCategoriesService.remove(id);
  }
}
