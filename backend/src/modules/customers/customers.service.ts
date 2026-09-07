import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { QueryCustomerDto } from './dto/query-customer.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';

const SORTABLE_FIELDS = new Set(['name', 'balance', 'createdAt', 'status']);

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Customer', (id) => this.prisma.customer.findUnique({ where: { id } }));
  }

  async findAll(query: QueryCustomerDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy && SORTABLE_FIELDS.has(query.sortBy) ? query.sortBy : 'createdAt';
    const sortDir = query.sortDir ?? 'desc';

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      status: query.status,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { companyName: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { orders: true } } },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (!customer || customer.deletedAt) throw new NotFoundException('Customer not found');
    return customer;
  }

  /**
   * Real queries against Order/Invoice/Payment/AuditLog — those tables already
   * exist from the Phase 0 schema even though the Sales/Payments *modules*
   * (Phase 4) haven't been built yet, so this returns genuinely empty lists
   * for now rather than mock data, and will populate itself once Phase 4 ships.
   */
  async getHistory(id: string) {
    await this.findOne(id);

    const [orders, invoices, payments, activity] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.invoice.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.payment.findMany({
        where: { payerCustomerId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.auditLog.findMany({
        where: { entityType: 'Customer', entityId: id },
        include: { actor: { select: { id: true, fullName: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return { orders, invoices, payments, activity };
  }

  async create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        name: dto.name,
        companyName: dto.companyName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        notes: dto.notes,
        creditLimit: dto.creditLimit,
      },
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const customer = await this.findOne(id);
    if (Number(customer.balance) !== 0) {
      throw new ConflictException('Cannot deactivate a customer with a non-zero balance');
    }
    return this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
  }
}
