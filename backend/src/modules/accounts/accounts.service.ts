import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateAccountDto } from './dto/create-account.dto.js';
import type { QueryAccountDto } from './dto/query-account.dto.js';
import type { UpdateAccountDto } from './dto/update-account.dto.js';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Account', (id) => this.prisma.account.findUnique({ where: { id } }));
  }

  async findAll(query: QueryAccountDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.AccountWhereInput = {
      type: query.type,
      category: query.category,
      isActive: query.isActive,
      ...(query.search && {
        OR: [
          { code: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { parent: { select: { id: true, code: true, name: true } } },
      }),
      this.prisma.account.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /** Full hierarchy (all accounts, unpaginated) for the Chart of Accounts tree view. */
  async findTree() {
    const accounts = await this.prisma.account.findMany({ orderBy: { code: 'asc' } });
    const byId = new Map(accounts.map((account) => [account.id, { ...account, children: [] as unknown[] }]));
    const roots: unknown[] = [];
    for (const account of byId.values()) {
      if (account.parentId && byId.has(account.parentId)) {
        (byId.get(account.parentId)!.children as unknown[]).push(account);
      } else {
        roots.push(account);
      }
    }
    return roots;
  }

  async findOne(id: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: { parent: { select: { id: true, code: true, name: true } } },
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async create(dto: CreateAccountDto) {
    const existing = await this.prisma.account.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Account code ${dto.code} is already in use`);

    if (dto.parentId) await this.assertParentExists(dto.parentId);

    return this.prisma.account.create({
      data: {
        code: dto.code,
        name: dto.name,
        type: dto.type,
        category: dto.category,
        parentId: dto.parentId,
        description: dto.description,
        isPostable: dto.isPostable ?? true,
        openingBalance: dto.openingBalance ?? 0,
        currentBalance: dto.openingBalance ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdateAccountDto) {
    const account = await this.findOne(id);

    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('An account cannot be its own parent');
      await this.assertParentExists(dto.parentId);
    }

    if (dto.isActive === false && account.isSystemAccount) {
      throw new ConflictException(`"${account.name}" is a system account and cannot be deactivated`);
    }
    if (dto.isActive === false && Number(account.currentBalance) !== 0) {
      throw new ConflictException('Cannot deactivate an account with a non-zero balance');
    }

    return this.prisma.account.update({
      where: { id },
      data: {
        name: dto.name,
        parentId: dto.parentId,
        description: dto.description,
        isPostable: dto.isPostable,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string) {
    const account = await this.findOne(id);
    if (account.isSystemAccount) throw new ConflictException(`"${account.name}" is a system account and cannot be deactivated`);
    if (Number(account.currentBalance) !== 0) throw new ConflictException('Cannot deactivate an account with a non-zero balance');
    const childCount = await this.prisma.account.count({ where: { parentId: id } });
    if (childCount > 0) throw new ConflictException('Cannot deactivate an account that has child accounts');
    return this.prisma.account.update({ where: { id }, data: { isActive: false } });
  }

  private async assertParentExists(parentId: string): Promise<void> {
    const parent = await this.prisma.account.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Parent account not found');
  }
}
