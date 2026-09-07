import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateSupplierDto } from './dto/create-supplier.dto.js';
import type { LinkProductDto } from './dto/link-product.dto.js';
import type { QuerySupplierDto } from './dto/query-supplier.dto.js';
import type { UpdateSupplierDto } from './dto/update-supplier.dto.js';

const SORTABLE_FIELDS = new Set(['companyName', 'balance', 'createdAt', 'status']);

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Supplier', (id) => this.prisma.supplier.findUnique({ where: { id } }));
  }

  async findAll(query: QuerySupplierDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy && SORTABLE_FIELDS.has(query.sortBy) ? query.sortBy : 'createdAt';
    const sortDir = query.sortDir ?? 'desc';

    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      status: query.status,
      ...(query.search && {
        OR: [
          { companyName: { contains: query.search, mode: 'insensitive' } },
          { contactPerson: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { purchaseOrders: true, supplierProducts: true } } },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: { _count: { select: { purchaseOrders: true, supplierProducts: true } } },
    });
    if (!supplier || supplier.deletedAt) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  /** Real queries against PurchaseOrder/Payment/AuditLog — Payments module (Phase 5) will populate the payments list. */
  async getHistory(id: string) {
    await this.findOne(id);

    const [purchaseOrders, payments, products, activity] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: { supplierId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.payment.findMany({
        where: { payeeSupplierId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.supplierProduct.findMany({
        where: { supplierId: id },
        include: { product: { select: { id: true, name: true, sku: true } } },
      }),
      this.prisma.auditLog.findMany({
        where: { entityType: 'Supplier', entityId: id },
        include: { actor: { select: { id: true, fullName: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return { purchaseOrders, payments, products, activity };
  }

  create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOne(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const supplier = await this.findOne(id);
    if (Number(supplier.balance) !== 0) {
      throw new ConflictException('Cannot deactivate a supplier with an outstanding balance');
    }
    return this.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
  }

  async linkProduct(supplierId: string, dto: LinkProductDto) {
    await this.findOne(supplierId);
    try {
      return await this.prisma.supplierProduct.create({
        data: { supplierId, productId: dto.productId, supplierSku: dto.supplierSku, unitCost: dto.unitCost },
        include: { product: { select: { id: true, name: true, sku: true } } },
      });
    } catch {
      throw new ConflictException('This product is already linked to this supplier');
    }
  }

  async unlinkProduct(supplierId: string, productId: string) {
    await this.findOne(supplierId);
    await this.prisma.supplierProduct.delete({
      where: { supplierId_productId: { supplierId, productId } },
    });
  }
}
