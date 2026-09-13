import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateDiscountDto } from './dto/create-discount.dto.js';
import type { GrantDiscountDto } from './dto/grant-discount.dto.js';
import type { QueryDiscountDto } from './dto/query-discount.dto.js';
import type { UpdateDiscountDto } from './dto/update-discount.dto.js';

const STUDENT_DISCOUNT_INCLUDE = {
  discount: true,
  enrollment: { select: { id: true, group: { select: { id: true, name: true, code: true } } } },
} satisfies Prisma.StudentDiscountInclude;

@Injectable()
export class DiscountsService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Discount', (id) => this.prisma.discount.findUnique({ where: { id } }));
    registry.register('StudentDiscount', (id) => this.prisma.studentDiscount.findUnique({ where: { id } }));
  }

  // ---------------------------------------------------------------------------
  // Discount catalog
  // ---------------------------------------------------------------------------

  async findAll(query: QueryDiscountDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.DiscountWhereInput = {
      type: query.type,
      isActive: query.isActive !== undefined ? query.isActive === 'true' : undefined,
      ...(query.search && { name: { contains: query.search, mode: 'insensitive' } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.discount.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.discount.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const discount = await this.prisma.discount.findUnique({ where: { id } });
    if (!discount) throw new NotFoundException('Discount not found');
    return discount;
  }

  async create(dto: CreateDiscountDto) {
    this.assertPercentageCap(dto.type, dto.value);
    return this.prisma.discount.create({ data: dto });
  }

  async update(id: string, dto: UpdateDiscountDto) {
    const discount = await this.findOne(id);
    const effectiveType = dto.type ?? discount.type;
    const effectiveValue = dto.value ?? Number(discount.value);
    this.assertPercentageCap(effectiveType, effectiveValue);

    return this.prisma.discount.update({ where: { id }, data: dto });
  }

  /** No hard delete — mirrors every other lookup entity: "removing" a discount deactivates it. Already-billed charges never re-read the Discount, so this never touches historical amounts. */
  async remove(id: string) {
    return this.update(id, { isActive: false });
  }

  // ---------------------------------------------------------------------------
  // Student grants (StudentDiscount)
  // ---------------------------------------------------------------------------

  async listStudentGrants(studentId: string) {
    await this.assertStudentExists(studentId);
    return this.prisma.studentDiscount.findMany({ where: { studentId }, include: STUDENT_DISCOUNT_INCLUDE, orderBy: { startDate: 'desc' } });
  }

  async grantToStudent(studentId: string, dto: GrantDiscountDto) {
    await this.assertStudentExists(studentId);
    const discount = await this.findOne(dto.discountId);
    if (!discount.isActive) throw new ConflictException('Cannot grant an inactive discount');

    if (dto.enrollmentId) {
      const enrollment = await this.prisma.enrollment.findUnique({ where: { id: dto.enrollmentId } });
      if (!enrollment) throw new NotFoundException('Enrollment not found');
      if (enrollment.studentId !== studentId) throw new BadRequestException("The enrollment does not belong to this student");
    }

    const startDate = new Date(dto.startDate);
    if (Number.isNaN(startDate.getTime())) throw new BadRequestException('Invalid startDate');
    let endDate: Date | undefined;
    if (dto.endDate) {
      endDate = new Date(dto.endDate);
      if (Number.isNaN(endDate.getTime())) throw new BadRequestException('Invalid endDate');
      if (endDate < startDate) throw new BadRequestException('endDate must not be before startDate');
    }

    return this.prisma.studentDiscount.create({
      data: { studentId, discountId: dto.discountId, enrollmentId: dto.enrollmentId, startDate, endDate, notes: dto.notes },
      include: STUDENT_DISCOUNT_INCLUDE,
    });
  }

  /** No hard delete — revoking a grant deactivates it, keeping the historical record of "this student had this discount from X to Y" intact for reporting. */
  async revokeGrant(studentId: string, studentDiscountId: string) {
    const grant = await this.prisma.studentDiscount.findUnique({ where: { id: studentDiscountId } });
    if (!grant || grant.studentId !== studentId) throw new NotFoundException('Discount grant not found for this student');
    return this.prisma.studentDiscount.update({ where: { id: studentDiscountId }, data: { isActive: false }, include: STUDENT_DISCOUNT_INCLUDE });
  }

  private assertPercentageCap(type: string, value: number): void {
    if (type === 'PERCENTAGE' && value > 100) {
      throw new BadRequestException('A PERCENTAGE discount cannot exceed 100');
    }
  }

  private async assertStudentExists(studentId: string): Promise<void> {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) throw new NotFoundException('Student not found');
  }
}
