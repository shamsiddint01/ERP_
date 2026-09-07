import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import type { UpdateWarehouseDto } from './dto/update-warehouse.dto.js';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Warehouse', (id) => this.prisma.warehouse.findUnique({ where: { id } }));
  }

  findAll() {
    return this.prisma.warehouse.findMany({
      include: { _count: { select: { inventoryStocks: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return warehouse;
  }

  async create(dto: CreateWarehouseDto) {
    try {
      return await this.prisma.warehouse.create({ data: dto });
    } catch (error) {
      throw this.translateUniqueConstraintError(error);
    }
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    await this.findOne(id);
    try {
      return await this.prisma.warehouse.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.translateUniqueConstraintError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    const stockCount = await this.prisma.inventoryStock.count({
      where: { warehouseId: id, quantityOnHand: { gt: 0 } },
    });
    if (stockCount > 0) {
      throw new ConflictException('Cannot deactivate a warehouse that still holds stock');
    }
    return this.prisma.warehouse.update({ where: { id }, data: { isActive: false } });
  }

  private translateUniqueConstraintError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('Warehouse code already in use');
    }
    return error;
  }
}
