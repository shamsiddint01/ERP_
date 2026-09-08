import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { ExpenseCategoriesService } from './expense-categories.service.js';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto.js';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto.js';

@ApiTags('expense-categories')
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly categoriesService: ExpenseCategoriesService) {}

  @Get()
  @RequirePermission('expenses', PermissionAction.VIEW)
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  @RequirePermission('expenses', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @RequirePermission('expenses', PermissionAction.CREATE)
  @Audited('ExpenseCategory')
  create(@Body() dto: CreateExpenseCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('expenses', PermissionAction.EDIT)
  @Audited('ExpenseCategory')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('expenses', PermissionAction.DELETE)
  @Audited('ExpenseCategory', 'DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.remove(id);
  }
}
