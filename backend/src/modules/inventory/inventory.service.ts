import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, StockMovementType, StockReferenceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { computeStockStatus } from '../../shared/inventory/stock-status.util.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { AdjustStockDto } from './dto/adjust-stock.dto.js';
import type { DamageStockDto } from './dto/damage-stock.dto.js';
import type { QueryMovementsDto } from './dto/query-movements.dto.js';
import type { QueryStockDto } from './dto/query-stock.dto.js';
import type { StockInDto } from './dto/stock-in.dto.js';
import type { StockOutDto } from './dto/stock-out.dto.js';

type TransactionClient = Prisma.TransactionClient;

type StockMovementWithRelations = Prisma.StockMovementGetPayload<{
  include: {
    product: { select: { id: true; name: true; sku: true } };
    warehouse: { select: { id: true; name: true } };
  };
}>;

const INBOUND_MOVEMENT_TYPES = new Set<StockMovementType>(['STOCK_IN', 'TRANSFER_IN', 'ADJUSTMENT_POSITIVE']);

export interface AdjustStockParams {
  productId: string;
  warehouseId: string;
  movementType: StockMovementType;
  quantity: number;
  referenceType?: StockReferenceType;
  referenceId?: string;
  unitCost?: number;
  performedByUserId?: string;
  note?: string;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('StockMovement', (id) => this.prisma.stockMovement.findUnique({ where: { id } }));
  }

  /**
   * The single choke point for every stock mutation in the system (Purchases,
   * Sales, transfers, manual adjustments will all call through here once
   * those modules exist) — it always writes the paired StockMovement row in
   * the same transaction as the InventoryStock update, so "every stock change
   * is logged to history" is structural, not a convention callers must
   * remember. Uses the InventoryStock.version column as an optimistic lock:
   * a concurrent modification loses and gets a 409 to retry, rather than
   * silently corrupting the balance.
   */
  async adjustStock(params: AdjustStockParams, tx?: TransactionClient): Promise<StockMovementWithRelations> {
    if (!tx) {
      return this.prisma.$transaction((trx) => this.adjustStock(params, trx));
    }

    const isInbound = INBOUND_MOVEMENT_TYPES.has(params.movementType);
    const signedQuantity = isInbound ? params.quantity : -params.quantity;

    let stock = await tx.inventoryStock.findUnique({
      where: { productId_warehouseId: { productId: params.productId, warehouseId: params.warehouseId } },
    });

    if (!stock) {
      if (!isInbound) {
        throw new ConflictException('Insufficient stock: no stock recorded for this product at this warehouse');
      }
      stock = await tx.inventoryStock.create({
        data: { productId: params.productId, warehouseId: params.warehouseId, quantityOnHand: 0 },
      });
    }

    const previousQuantity = Number(stock.quantityOnHand);
    if (!isInbound && previousQuantity < params.quantity) {
      throw new ConflictException(`Insufficient stock: available ${previousQuantity}, requested ${params.quantity}`);
    }
    const newQuantity = previousQuantity + signedQuantity;

    const updateResult = await tx.inventoryStock.updateMany({
      where: { id: stock.id, version: stock.version },
      data: { quantityOnHand: newQuantity, version: { increment: 1 } },
    });
    if (updateResult.count === 0) {
      throw new ConflictException('Stock was modified concurrently — please retry');
    }

    return tx.stockMovement.create({
      data: {
        productId: params.productId,
        warehouseId: params.warehouseId,
        movementType: params.movementType,
        quantity: params.quantity,
        previousQuantity,
        balanceAfter: newQuantity,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        unitCost: params.unitCost,
        performedByUserId: params.performedByUserId,
        note: params.note,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });
  }

  stockIn(dto: StockInDto, userId: string) {
    return this.adjustStock({
      productId: dto.productId,
      warehouseId: dto.warehouseId,
      movementType: 'STOCK_IN',
      quantity: dto.quantity,
      referenceType: dto.referenceType ?? 'PURCHASE',
      referenceId: dto.referenceId,
      unitCost: dto.unitCost,
      performedByUserId: userId,
      note: dto.note,
    });
  }

  stockOut(dto: StockOutDto, userId: string) {
    return this.adjustStock({
      productId: dto.productId,
      warehouseId: dto.warehouseId,
      movementType: 'STOCK_OUT',
      quantity: dto.quantity,
      referenceType: dto.referenceType ?? 'SALE',
      referenceId: dto.referenceId,
      performedByUserId: userId,
      note: dto.note,
    });
  }

  adjust(dto: AdjustStockDto, userId: string) {
    return this.adjustStock({
      productId: dto.productId,
      warehouseId: dto.warehouseId,
      movementType: dto.direction === 'INCREASE' ? 'ADJUSTMENT_POSITIVE' : 'ADJUSTMENT_NEGATIVE',
      quantity: dto.quantity,
      referenceType: 'ADJUSTMENT',
      performedByUserId: userId,
      note: dto.note,
    });
  }

  damage(dto: DamageStockDto, userId: string) {
    return this.adjustStock({
      productId: dto.productId,
      warehouseId: dto.warehouseId,
      movementType: 'ADJUSTMENT_NEGATIVE',
      quantity: dto.quantity,
      referenceType: 'DAMAGED',
      performedByUserId: userId,
      note: dto.note,
    });
  }

  async listStock(query: QueryStockDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.InventoryStockWhereInput = {
      warehouseId: query.warehouseId,
      productId: query.productId,
      ...(query.search && {
        product: {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { sku: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.inventoryStock.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: { select: { id: true, name: true, sku: true, minStockLevel: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.inventoryStock.count({ where }),
    ]);

    const lastMovements = await Promise.all(
      rows.map((row) =>
        this.prisma.stockMovement.findFirst({
          where: { productId: row.productId, warehouseId: row.warehouseId },
          orderBy: { createdAt: 'desc' },
        }),
      ),
    );

    let items = rows.map((row, index) => {
      const minStockLevel = Number(row.minStockLevel ?? row.product.minStockLevel);
      return {
        ...row,
        stockStatus: computeStockStatus(Number(row.quantityOnHand), minStockLevel),
        lastMovement: lastMovements[index],
      };
    });

    if (query.lowStockOnly) {
      items = items.filter((item) => item.stockStatus !== 'HEALTHY');
    }

    return { items, total, page, pageSize };
  }

  async listMovements(query: QueryMovementsDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.StockMovementWhereInput = {
      productId: query.productId,
      warehouseId: query.warehouseId,
      movementType: query.movementType,
      referenceType: query.referenceType,
      ...((query.from || query.to) && {
        createdAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          warehouse: { select: { id: true, name: true } },
          performedBy: { select: { id: true, fullName: true, username: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getSummary() {
    const [totalProducts, stockAggregate, allStock, recentMovements] = await Promise.all([
      this.prisma.product.count({ where: { deletedAt: null } }),
      this.prisma.inventoryStock.aggregate({ _sum: { quantityOnHand: true } }),
      this.prisma.inventoryStock.findMany({
        include: { product: { select: { minStockLevel: true } } },
      }),
      this.prisma.stockMovement.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          warehouse: { select: { id: true, name: true } },
        },
      }),
    ]);

    let lowStockCount = 0;
    let outOfStockCount = 0;
    for (const stock of allStock) {
      const status = computeStockStatus(Number(stock.quantityOnHand), Number(stock.minStockLevel ?? stock.product.minStockLevel));
      if (status === 'LOW_STOCK') lowStockCount += 1;
      if (status === 'OUT_OF_STOCK') outOfStockCount += 1;
    }

    return {
      totalProducts,
      totalStockQuantity: Number(stockAggregate._sum.quantityOnHand ?? 0),
      lowStockCount,
      outOfStockCount,
      recentMovements,
    };
  }
}
