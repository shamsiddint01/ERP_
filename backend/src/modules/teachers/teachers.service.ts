import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateTeacherDto } from './dto/create-teacher.dto.js';
import type { QueryTeacherDto } from './dto/query-teacher.dto.js';
import type { UpdateTeacherDto } from './dto/update-teacher.dto.js';

const EMPLOYEE_SUMMARY_SELECT = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  fullName: true,
  phone: true,
  email: true,
  status: true,
  department: { select: { id: true, name: true } },
  position: { select: { id: true, title: true } },
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('TeacherProfile', (id) => this.prisma.teacherProfile.findUnique({ where: { id } }));
  }

  async findAll(query: QueryTeacherDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const employeeFilter: Prisma.EmployeeWhereInput = {};
    if (query.departmentId) employeeFilter.departmentId = query.departmentId;
    if (query.branchId) employeeFilter.taughtGroups = { some: { branchId: query.branchId } };

    const where: Prisma.TeacherProfileWhereInput = {
      status: query.status,
      ...(Object.keys(employeeFilter).length > 0 && { employee: employeeFilter }),
      ...(query.search && {
        OR: [
          { specialization: { contains: query.search, mode: 'insensitive' } },
          { employee: { fullName: { contains: query.search, mode: 'insensitive' } } },
          { employee: { phone: { contains: query.search, mode: 'insensitive' } } },
          { employee: { employeeCode: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.teacherProfile.findMany({
        where,
        include: {
          employee: { select: { ...EMPLOYEE_SUMMARY_SELECT, _count: { select: { taughtGroups: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.teacherProfile.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const profile = await this.prisma.teacherProfile.findUnique({ where: { id }, include: { employee: { select: EMPLOYEE_SUMMARY_SELECT } } });
    if (!profile) throw new NotFoundException('Teacher profile not found');

    const groups = await this.prisma.studentGroup.findMany({
      where: { teacherEmployeeId: profile.employeeId },
      include: {
        course: { select: { id: true, name: true, code: true } },
        branch: { select: { id: true, name: true, code: true } },
        _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: { startDate: 'desc' },
    });

    const groupIds = groups.map((g) => g.id);
    const activeGroupsCount = groups.filter((g) => g.status === 'ACTIVE').length;
    const activeStudentsCount = groups.reduce((sum, g) => sum + g._count.enrollments, 0);
    const distinctStudents = groupIds.length
      ? await this.prisma.enrollment.findMany({ where: { groupId: { in: groupIds } }, select: { studentId: true }, distinct: ['studentId'] })
      : [];

    return {
      ...profile,
      groups: groups.map((g) => ({ ...g, enrolledCount: g._count.enrollments })),
      workload: {
        activeGroupsCount,
        activeStudentsCount,
        totalEnrolledStudents: distinctStudents.length,
      },
    };
  }

  async create(dto: CreateTeacherDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee || employee.deletedAt) throw new NotFoundException('Employee not found');

    const existing = await this.prisma.teacherProfile.findUnique({ where: { employeeId: dto.employeeId } });
    if (existing) throw new ConflictException('This employee already has a teacher profile');

    return this.prisma.teacherProfile.create({
      data: {
        employeeId: dto.employeeId,
        bio: dto.bio,
        specialization: dto.specialization,
        qualification: dto.qualification,
        experienceYears: dto.experienceYears,
        hourlyRate: dto.hourlyRate,
        perLessonRate: dto.perLessonRate,
        perGroupRate: dto.perGroupRate,
        status: dto.status,
      },
      include: { employee: { select: EMPLOYEE_SUMMARY_SELECT } },
    });
  }

  async update(id: string, dto: UpdateTeacherDto) {
    const profile = await this.getProfileOrThrow(id);

    if (dto.status === 'INACTIVE') {
      const openGroupsCount = await this.prisma.studentGroup.count({
        where: { teacherEmployeeId: profile.employeeId, status: { in: ['PLANNED', 'ACTIVE', 'PAUSED'] } },
      });
      if (openGroupsCount > 0) {
        throw new ConflictException('Cannot deactivate a teacher who still has active, paused or planned groups assigned');
      }
    }

    return this.prisma.teacherProfile.update({
      where: { id },
      data: {
        bio: dto.bio,
        specialization: dto.specialization,
        qualification: dto.qualification,
        experienceYears: dto.experienceYears,
        hourlyRate: dto.hourlyRate,
        perLessonRate: dto.perLessonRate,
        perGroupRate: dto.perGroupRate,
        status: dto.status,
      },
      include: { employee: { select: EMPLOYEE_SUMMARY_SELECT } },
    });
  }

  /** No hard delete — an inactive profile keeps the teaching history intact while making the employee ineligible for new group assignments (Phase D §26). */
  async remove(id: string) {
    return this.update(id, { status: 'INACTIVE' });
  }

  private async getProfileOrThrow(id: string) {
    const profile = await this.prisma.teacherProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Teacher profile not found');
    return profile;
  }
}
