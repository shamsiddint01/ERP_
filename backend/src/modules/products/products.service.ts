import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { computeStockStatus } from '../../shared/inventory/stock-status.util.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { QueryProductDto } from './dto/query-product.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';

const SORTABLE_FIELDS = new Set(['name', 'sku', 'salePrice', 'costPrice', 'createdAt']);

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Product', (id) => this.prisma.product.findUnique({ where: { id } }));
  }

  async findAll(query: QueryProductDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy && SORTABLE_FIELDS.has(query.sortBy) ? query.sortBy : 'createdAt';
    const sortDir = query.sortDir ?? 'desc';

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      categoryId: query.categoryId,
      status: query.status,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
          { barcode: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    if (query.lowStockOnly) {
      const lowStockRows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT p.id
        FROM products p
        LEFT JOIN (
          SELECT product_id, SUM(quantity_on_hand) AS total_stock
          FROM inventory_stocks
          GROUP BY product_id
        ) s ON s.product_id = p.id
        WHERE p.deleted_at IS NULL AND COALESCE(s.total_stock, 0) <= p.min_stock_level
      `);
      where.id = { in: lowStockRows.map((row) => row.id) };
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: { select: { id: true, name: true } }, images: { where: { isPrimary: true }, take: 1 } },
      }),
      this.prisma.product.count({ where }),
    ]);

    const stockTotals = await this.getStockTotals(products.map((p) => p.id));
    const items = products.map((product) => this.withStockInfo(product, stockTotals.get(product.id) ?? 0));

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        images: true,
        inventoryStocks: { include: { warehouse: { select: { id: true, name: true, code: true } } } },
      },
    });
    if (!product || product.deletedAt) throw new NotFoundException('Product not found');

    const totalStock = product.inventoryStocks.reduce((sum, stock) => sum + Number(stock.quantityOnHand), 0);
    return this.withStockInfo(product, totalStock);
  }

  async create(dto: CreateProductDto) {
    await this.assertSkuAndBarcodeAvailable(dto.sku, dto.barcode);
    try {
      return await this.prisma.product.create({
        data: {
          name: dto.name,
          sku: dto.sku,
          barcode: dto.barcode,
          categoryId: dto.categoryId,
          description: dto.description,
          salePrice: dto.salePrice,
          costPrice: dto.costPrice,
          taxRateId: dto.taxRateId,
          unit: dto.unit,
          minStockLevel: dto.minStockLevel ?? 0,
          status: dto.status ?? 'ACTIVE',
        },
      });
    } catch (error) {
      throw this.translateUniqueConstraintError(error);
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    if (dto.sku || dto.barcode) {
      await this.assertSkuAndBarcodeAvailable(dto.sku, dto.barcode, id);
    }
    try {
      return await this.prisma.product.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.translateUniqueConstraintError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DISCONTINUED' },
    });
  }

  private async getStockTotals(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const grouped = await this.prisma.inventoryStock.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { quantityOnHand: true },
    });
    return new Map(grouped.map((row) => [row.productId, Number(row._sum.quantityOnHand ?? 0)]));
  }

  private withStockInfo<T extends { minStockLevel: Prisma.Decimal }>(product: T, totalStock: number) {
    return {
      ...product,
      totalStock,
      stockStatus: computeStockStatus(totalStock, Number(product.minStockLevel)),
    };
  }

  private async assertSkuAndBarcodeAvailable(sku?: string, barcode?: string, excludeId?: string): Promise<void> {
    if (!sku && !barcode) return;
    const existing = await this.prisma.product.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        OR: [sku ? { sku } : undefined, barcode ? { barcode } : undefined].filter(Boolean) as Prisma.ProductWhereInput[],
      },
    });
    if (existing) throw new ConflictException('SKU or barcode already in use by another product');
  }

  private translateUniqueConstraintError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('SKU or barcode already in use by another product');
    }
    return error;
  }
}
