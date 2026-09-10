import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { CreatePayrollComponentDto } from './dto/create-payroll-component.dto.js';
import type { UpdatePayrollComponentDto } from './dto/update-payroll-component.dto.js';

@Injectable()
export class PayrollComponentsService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('PayrollComponent', (id) => this.prisma.payrollComponent.findUnique({ where: { id } }));
  }

  findAll() {
    return this.prisma.payrollComponent.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { lines: true } } } });
  }

  async findOne(id: string) {
    const component = await this.prisma.payrollComponent.findUnique({ where: { id } });
    if (!component) throw new NotFoundException('Payroll component not found');
    return component;
  }

  async create(dto: CreatePayrollComponentDto) {
    const existing = await this.prisma.payrollComponent.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`A payroll component named "${dto.name}" already exists`);
    return this.prisma.payrollComponent.create({
      data: { name: dto.name, type: dto.type, isPercentage: dto.isPercentage ?? false, defaultAmount: dto.defaultAmount },
    });
  }

  async update(id: string, dto: UpdatePayrollComponentDto) {
    await this.findOne(id);
    return this.prisma.payrollComponent.update({
      where: { id },
      data: { name: dto.name, isPercentage: dto.isPercentage, defaultAmount: dto.defaultAmount, isActive: dto.isActive },
    });
  }

  async remove(id: string) {
    const component = await this.findOne(id);
    if (component.isSystem) throw new ConflictException(`"${component.name}" is a system component and cannot be removed`);
    const lineCount = await this.prisma.payrollLine.count({ where: { componentId: id } });
    if (lineCount > 0) throw new ConflictException('Cannot remove a component that is already used on payroll lines — deactivate it instead');
    await this.prisma.payrollComponent.delete({ where: { id } });
    return { id };
  }
}
