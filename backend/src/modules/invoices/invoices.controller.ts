import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { QueryInvoiceDto } from './dto/query-invoice.dto.js';
import { UpdateInvoiceDto } from './dto/update-invoice.dto.js';
import { InvoicesService } from './invoices.service.js';

/** @deprecated Legacy retail module — retained for historical records and existing operations. Primary product is the education center (Tuition/Payment). */
@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @RequirePermission('invoices', PermissionAction.VIEW)
  findAll(@Query() query: QueryInvoiceDto) {
    return this.invoicesService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('invoices', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.findOne(id);
  }

  @Get(':id/pdf')
  @RequirePermission('invoices', PermissionAction.VIEW)
  @Header('Content-Type', 'application/pdf')
  async getPdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const buffer = await this.invoicesService.getPdf(id);
    res.setHeader('Content-Disposition', `inline; filename="invoice-${id}.pdf"`);
    res.send(buffer);
  }

  @Post()
  @RequirePermission('invoices', PermissionAction.CREATE)
  @Audited('Invoice')
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('invoices', PermissionAction.EDIT)
  @Audited('Invoice')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoicesService.update(id, dto);
  }

  @Post(':id/send')
  @RequirePermission('invoices', PermissionAction.EDIT)
  @Audited('Invoice', 'SEND')
  send(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.send(id);
  }

  @Post(':id/void')
  @RequirePermission('invoices', PermissionAction.APPROVE)
  @Audited('Invoice', 'VOID')
  void(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.void(id);
  }
}
