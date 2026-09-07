import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateTransferDto } from './dto/create-transfer.dto.js';
import type { QueryTransfersDto } from './dto/query-transfers.dto.js';
import { InventoryService } from './inventory.service.js';

const TRANSFER_INCLUDE = {
  fromWarehouse: { select: { id: true, name: true, code: true } },
  toWarehouse: { select: { id: true, name: true, code: true } },
  requestedBy: { select: { id: true, fullName: true, username: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
} satisfies Prisma.StockTransferInclude;

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('StockTransfer', (id) => this.prisma.stockTransfer.findUnique({ where: { id } }));
  }

  async findAll(query: QueryTransfersDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.StockTransferWhereInput = {
      status: query.status,
      ...(query.warehouseId && { OR: [{ fromWarehouseId: query.warehouseId }, { toWarehouseId: query.warehouseId }] }),
    };

    const [items, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        include: TRANSFER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id }, include: TRANSFER_INCLUDE });
    if (!transfer) throw new NotFoundException('Stock transfer not found');
    return transfer;
  }

  async create(dto: CreateTransferDto, userId: string) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Source and destination warehouse must be different');
    }
    const warehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: [dto.fromWarehouseId, dto.toWarehouseId] } },
    });
    if (warehouses.length !== 2) throw new BadRequestException('Source or destination warehouse does not exist');

    return this.prisma.stockTransfer.create({
      data: {
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        requestedByUserId: userId,
        items: { create: dto.items.map((item) => ({ productId: item.productId, quantity: item.quantity })) },
      },
      include: TRANSFER_INCLUDE,
    });
  }

  /** Moves the physical stock: one TRANSFER_OUT + one TRANSFER_IN per item, atomically. */
  async complete(id: string) {
    const transfer = await this.findOne(id);
    if (transfer.status !== 'DRAFT') {
      throw new ConflictException(`Only DRAFT transfers can be completed (current status: ${transfer.status})`);
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await this.inventoryService.adjustStock(
          {
            productId: item.productId,
            warehouseId: transfer.fromWarehouseId,
            movementType: 'TRANSFER_OUT',
            quantity: Number(item.quantity),
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            performedByUserId: transfer.requestedByUserId ?? undefined,
          },
          tx,
        );
        await this.inventoryService.adjustStock(
          {
            productId: item.productId,
            warehouseId: transfer.toWarehouseId,
            movementType: 'TRANSFER_IN',
            quantity: Number(item.quantity),
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            performedByUserId: transfer.requestedByUserId ?? undefined,
          },
          tx,
        );
      }

      return tx.stockTransfer.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
        include: TRANSFER_INCLUDE,
      });
    });
  }

  async cancel(id: string) {
    const transfer = await this.findOne(id);
    if (transfer.status !== 'DRAFT') {
      throw new ConflictException(`Only DRAFT transfers can be cancelled (current status: ${transfer.status})`);
    }
    return this.prisma.stockTransfer.update({ where: { id }, data: { status: 'CANCELLED' }, include: TRANSFER_INCLUDE });
  }
}
