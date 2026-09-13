import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateDiscountDto } from './dto/create-discount.dto.js';
import { QueryDiscountDto } from './dto/query-discount.dto.js';
import { UpdateDiscountDto } from './dto/update-discount.dto.js';
import { DiscountsService } from './discounts.service.js';

@ApiTags('discounts')
@Controller('discounts')
export class DiscountsController {
  constructor(private readonly discountsService: DiscountsService) {}

  @Get()
  @RequirePermission('discounts', PermissionAction.VIEW)
  findAll(@Query() query: QueryDiscountDto) {
    return this.discountsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('discounts', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.discountsService.findOne(id);
  }

  @Post()
  @RequirePermission('discounts', PermissionAction.CREATE)
  @Audited('Discount')
  create(@Body() dto: CreateDiscountDto) {
    return this.discountsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('discounts', PermissionAction.EDIT)
  @Audited('Discount')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDiscountDto) {
    return this.discountsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('discounts', PermissionAction.DELETE)
  @Audited('Discount', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.discountsService.remove(id);
  }
}
