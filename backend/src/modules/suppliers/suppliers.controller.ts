import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { LinkProductDto } from './dto/link-product.dto.js';
import { QuerySupplierDto } from './dto/query-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { SuppliersService } from './suppliers.service.js';

/** @deprecated Legacy retail module — retained for historical records and existing operations. Primary product is the education center. */
@ApiTags('suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @RequirePermission('suppliers', PermissionAction.VIEW)
  findAll(@Query() query: QuerySupplierDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('suppliers', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.findOne(id);
  }

  @Get(':id/history')
  @RequirePermission('suppliers', PermissionAction.VIEW)
  getHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.getHistory(id);
  }

  @Post()
  @RequirePermission('suppliers', PermissionAction.CREATE)
  @Audited('Supplier')
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('suppliers', PermissionAction.EDIT)
  @Audited('Supplier')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('suppliers', PermissionAction.DELETE)
  @Audited('Supplier', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.remove(id);
  }

  @Post(':id/products')
  @RequirePermission('suppliers', PermissionAction.EDIT)
  @Audited('SupplierProduct')
  linkProduct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkProductDto) {
    return this.suppliersService.linkProduct(id, dto);
  }

  @Delete(':id/products/:productId')
  @RequirePermission('suppliers', PermissionAction.EDIT)
  @Audited('SupplierProduct', 'UNLINK')
  unlinkProduct(@Param('id', ParseUUIDPipe) id: string, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.suppliersService.unlinkProduct(id, productId);
  }
}
