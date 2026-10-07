import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { generateDocumentNumber } from '../../shared/utils/document-number.util.js';
import type { CreateStudentDto } from './dto/create-student.dto.js';
import type { QueryStudentDto } from './dto/query-student.dto.js';
import type { UpdateStudentDto } from './dto/update-student.dto.js';

const STUDENT_LIST_INCLUDE = {
  branch: { select: { id: true, name: true, code: true } },
  user: { select: { id: true, username: true, status: true } },
  _count: { select: { enrollments: true } },
} satisfies Prisma.StudentInclude;

const STUDENT_DETAIL_INCLUDE = {
  branch: { select: { id: true, name: true, code: true } },
  user: { select: { id: true, username: true, status: true } },
  enrollments: {
    include: {
      group: {
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          course: { select: { id: true, name: true, code: true } },
          branch: { select: { id: true, name: true, code: true } },
          teacherEmployee: { select: { id: true, fullName: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.StudentInclude;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Student', (id) => this.prisma.student.findUnique({ where: { id } }));
  }

  async findAll(query: QueryStudentDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.StudentWhereInput = {
      status: query.status,
      branchId: query.branchId,
      ...((query.from || query.to) && {
        registrationDate: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
      }),
      ...(query.search && {
        OR: [
          { studentCode: { contains: query.search, mode: 'insensitive' } },
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        include: STUDENT_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.student.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const student = await this.prisma.student.findUnique({ where: { id }, include: STUDENT_DETAIL_INCLUDE });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  async create(dto: CreateStudentDto) {
    await this.assertReferencesValid(dto, null);

    const studentCode = dto.studentCode ?? (await generateDocumentNumber('STU', () => this.prisma.student.count()));
    const existingCode = await this.prisma.student.findUnique({ where: { studentCode } });
    if (existingCode) throw new ConflictException(`Student code "${studentCode}" is already in use`);

    return this.prisma.student.create({
      data: {
        studentCode,
        firstName: dto.firstName,
        lastName: dto.lastName,
        fullName: `${dto.firstName} ${dto.lastName}`.trim(),
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        photoUrl: dto.photoUrl,
        status: dto.status,
        registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : undefined,
        source: dto.source,
        emergencyContact: dto.emergencyContact,
        notes: dto.notes,
        branchId: dto.branchId,
        userId: dto.userId,
      },
      include: STUDENT_DETAIL_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateStudentDto) {
    const student = await this.findOne(id);
    await this.assertReferencesValid(dto, id);

    const firstName = dto.firstName ?? student.firstName;
    const lastName = dto.lastName ?? student.lastName;

    return this.prisma.student.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        fullName: dto.firstName || dto.lastName ? `${firstName} ${lastName}`.trim() : undefined,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        photoUrl: dto.photoUrl,
        status: dto.status,
        source: dto.source,
        emergencyContact: dto.emergencyContact,
        notes: dto.notes,
        branchId: dto.branchId,
        userId: dto.userId,
      },
      include: STUDENT_DETAIL_INCLUDE,
    });
  }

  /** No deletedAt column on Student (Phase A) — mirrors Department/Employee: "removing" a student means marking it INACTIVE, never destroying history. */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.student.update({ where: { id }, data: { status: 'INACTIVE' }, include: STUDENT_DETAIL_INCLUDE });
  }

  /** `excludeStudentId` lets update() re-save a student's own already-linked userId without tripping the "already linked" check. */
  private async assertReferencesValid(dto: Partial<CreateStudentDto>, excludeStudentId: string | null): Promise<void> {
    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch) throw new NotFoundException('Branch not found');
    }
    if (dto.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
      if (!user) throw new NotFoundException('User not found');
      const linkedStudent = await this.prisma.student.findUnique({ where: { userId: dto.userId } });
      if (linkedStudent && linkedStudent.id !== excludeStudentId) {
        throw new ConflictException('This user account is already linked to another student');
      }
    }
  }
}
