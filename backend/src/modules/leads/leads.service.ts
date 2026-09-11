import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LeadStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { generateDocumentNumber } from '../../shared/utils/document-number.util.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { ChangeLeadStatusDto } from './dto/change-lead-status.dto.js';
import type { ConvertLeadDto } from './dto/convert-lead.dto.js';
import type { CreateLeadActivityDto } from './dto/create-lead-activity.dto.js';
import type { CreateLeadDto } from './dto/create-lead.dto.js';
import type { QueryLeadDto } from './dto/query-lead.dto.js';
import type { UpdateLeadDto } from './dto/update-lead.dto.js';

const LEAD_LIST_INCLUDE = {
  preferredCourse: { select: { id: true, name: true, code: true } },
  preferredBranch: { select: { id: true, name: true, code: true } },
  assignedEmployee: { select: { id: true, fullName: true } },
  _count: { select: { activities: true } },
} satisfies Prisma.LeadInclude;

const LEAD_DETAIL_INCLUDE = {
  ...LEAD_LIST_INCLUDE,
  activities: {
    include: { employee: { select: { id: true, fullName: true } } },
    orderBy: { occurredAt: 'desc' },
  },
  convertedStudent: { select: { id: true, studentCode: true, fullName: true, status: true } },
} satisfies Prisma.LeadInclude;

const CONVERTED_STUDENT_INCLUDE = {
  branch: { select: { id: true, name: true, code: true } },
  convertedFromLead: { select: { id: true, fullName: true } },
} satisfies Prisma.StudentInclude;

/**
 * Allowed forward moves per current status. ENROLLED is deliberately
 * unreachable here — the only path to ENROLLED is LeadsService.convert(),
 * which atomically creates the Student alongside the status flip; allowing
 * a plain status PATCH to set ENROLLED would produce a lead that claims to
 * be converted with no Student behind it.
 */
const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: [LeadStatus.CONTACTED, LeadStatus.LOST],
  CONTACTED: [LeadStatus.TRIAL_SCHEDULED, LeadStatus.LOST],
  TRIAL_SCHEDULED: [LeadStatus.TRIAL_COMPLETED, LeadStatus.LOST],
  TRIAL_COMPLETED: [LeadStatus.LOST],
  ENROLLED: [],
  LOST: [LeadStatus.CONTACTED],
};

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] ?? fullName, lastName: parts.slice(1).join(' ') || parts[0] };
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Lead', (id) => this.prisma.lead.findUnique({ where: { id } }));
  }

  async findAll(query: QueryLeadDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.LeadWhereInput = {
      status: query.status,
      preferredCourseId: query.preferredCourseId,
      preferredBranchId: query.preferredBranchId,
      assignedEmployeeId: query.assignedEmployeeId,
      source: query.source,
      ...((query.createdFrom || query.createdTo) && {
        createdAt: {
          gte: query.createdFrom ? new Date(query.createdFrom) : undefined,
          lte: query.createdTo ? new Date(query.createdTo) : undefined,
        },
      }),
      ...((query.followUpFrom || query.followUpTo) && {
        nextFollowUpAt: {
          gte: query.followUpFrom ? new Date(query.followUpFrom) : undefined,
          lte: query.followUpTo ? new Date(query.followUpTo) : undefined,
        },
      }),
      ...(query.search && {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: LEAD_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, include: LEAD_DETAIL_INCLUDE });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async create(dto: CreateLeadDto) {
    await this.assertReferencesValid(dto);

    const lead = await this.prisma.lead.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        preferredCourseId: dto.preferredCourseId,
        preferredBranchId: dto.preferredBranchId,
        source: dto.source,
        assignedEmployeeId: dto.assignedEmployeeId,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
        notes: dto.notes,
      },
      include: LEAD_DETAIL_INCLUDE,
    });

    if (lead.assignedEmployeeId) await this.notifyAssignee(lead.id, lead.assignedEmployeeId, lead.fullName, 'yangi lid biriktirildi');
    return lead;
  }

  async update(id: string, dto: UpdateLeadDto) {
    const existing = await this.findOne(id);
    await this.assertReferencesValid(dto);

    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        preferredCourseId: dto.preferredCourseId,
        preferredBranchId: dto.preferredBranchId,
        source: dto.source,
        assignedEmployeeId: dto.assignedEmployeeId,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
        notes: dto.notes,
      },
      include: LEAD_DETAIL_INCLUDE,
    });

    if (dto.assignedEmployeeId && dto.assignedEmployeeId !== existing.assignedEmployeeId) {
      await this.notifyAssignee(lead.id, dto.assignedEmployeeId, lead.fullName, 'lid sizga qayta biriktirildi');
    }
    return lead;
  }

  /** A lead already converted to a student must never be deleted — it is that student's admission history. */
  async remove(id: string) {
    const lead = await this.findOne(id);
    if (lead.status === 'ENROLLED' || lead.convertedStudent) {
      throw new ConflictException('Cannot delete a lead that has already been converted to a student');
    }
    await this.prisma.lead.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Activities
  // ---------------------------------------------------------------------------

  /** `actingUserId` is the logged-in User's id (from the JWT) — resolved to the Employee it's linked to, if any, so the activity is attributed to whoever actually logged it. */
  async addActivity(leadId: string, dto: CreateLeadActivityDto, actingUserId?: string) {
    await this.findOne(leadId);

    let employeeId: string | undefined;
    if (actingUserId) {
      const user = await this.prisma.user.findUnique({ where: { id: actingUserId }, select: { employeeId: true } });
      employeeId = user?.employeeId ?? undefined;
    }

    await this.prisma.leadActivity.create({
      data: {
        leadId,
        type: dto.type,
        description: dto.description,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        employeeId,
      },
    });
    return this.findOne(leadId);
  }

  async listActivities(leadId: string) {
    await this.findOne(leadId);
    return this.prisma.leadActivity.findMany({
      where: { leadId },
      include: { employee: { select: { id: true, fullName: true } } },
      orderBy: { occurredAt: 'desc' },
    });
  }

  async removeActivity(leadId: string, activityId: string) {
    const result = await this.prisma.leadActivity.deleteMany({ where: { id: activityId, leadId } });
    if (result.count === 0) throw new NotFoundException('Activity not found for this lead');
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Workflow
  // ---------------------------------------------------------------------------

  async changeStatus(id: string, dto: ChangeLeadStatusDto) {
    if (dto.status === LeadStatus.ENROLLED) {
      throw new BadRequestException('Use POST /leads/:id/convert to move a lead to ENROLLED — status cannot be set directly');
    }
    const lead = await this.findOne(id);
    const allowed = LEAD_TRANSITIONS[lead.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(`Cannot move a lead from ${lead.status} to ${dto.status}`);
    }

    const result = await this.prisma.lead.updateMany({ where: { id, status: lead.status }, data: { status: dto.status } });
    if (result.count === 0) throw new ConflictException('Lead status was changed concurrently — please retry');
    return this.findOne(id);
  }

  /**
   * Atomic Lead -> Student conversion. Everything happens in one transaction:
   * if Student creation fails for any reason, the Lead's status flip rolls
   * back with it, so a lead can never end up ENROLLED without a Student.
   * The status-guarded updateMany doubles as both "reject an already-
   * converted lead" and "reject a concurrent double conversion" (Phase 8 CAS
   * pattern) — both return 409.
   */
  async convert(id: string, dto: ConvertLeadDto) {
    const lead = await this.findOne(id);
    if (lead.status === 'ENROLLED' || lead.convertedStudent) {
      throw new ConflictException('This lead has already been converted to a student');
    }

    const { firstName, lastName } = dto.firstName || dto.lastName
      ? { firstName: dto.firstName ?? splitFullName(lead.fullName).firstName, lastName: dto.lastName ?? splitFullName(lead.fullName).lastName }
      : splitFullName(lead.fullName);

    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch) throw new NotFoundException('Branch not found');
    }

    const studentCode = dto.studentCode ?? (await generateDocumentNumber('STU', () => this.prisma.student.count()));

    return this.prisma.$transaction(async (tx) => {
      const statusUpdate = await tx.lead.updateMany({ where: { id, status: lead.status }, data: { status: 'ENROLLED' } });
      if (statusUpdate.count === 0) {
        throw new ConflictException('This lead was already converted or modified concurrently — please retry');
      }

      const existingCode = await tx.student.findUnique({ where: { studentCode } });
      if (existingCode) throw new ConflictException(`Student code "${studentCode}" is already in use`);

      return tx.student.create({
        data: {
          studentCode,
          firstName,
          lastName,
          fullName: lead.fullName,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          phone: lead.phone,
          email: lead.email,
          branchId: dto.branchId ?? lead.preferredBranchId ?? undefined,
          source: lead.source ?? 'LEAD_CONVERSION',
          status: 'ACTIVE',
          convertedFromLeadId: lead.id,
        },
        include: CONVERTED_STUDENT_INCLUDE,
      });
    }).then(async (student) => {
      if (lead.assignedEmployeeId) await this.notifyAssignee(lead.id, lead.assignedEmployeeId, lead.fullName, 'lid talabaga aylantirildi');
      return student;
    });
  }

  private async assertReferencesValid(dto: Partial<CreateLeadDto>): Promise<void> {
    if (dto.preferredCourseId) {
      const course = await this.prisma.course.findUnique({ where: { id: dto.preferredCourseId } });
      if (!course) throw new NotFoundException('Course not found');
    }
    if (dto.preferredBranchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.preferredBranchId } });
      if (!branch) throw new NotFoundException('Branch not found');
    }
    if (dto.assignedEmployeeId) {
      const employee = await this.prisma.employee.findUnique({ where: { id: dto.assignedEmployeeId } });
      if (!employee) throw new NotFoundException('Employee not found');
    }
  }

  /** Best-effort — a notification failure must never fail the lead operation itself. Reuses the generic SYSTEM type; no new NotificationType is introduced in Phase B. */
  private async notifyAssignee(leadId: string, employeeId: string, leadName: string, reasonUz: string): Promise<void> {
    try {
      const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { user: { select: { id: true } } } });
      if (!employee?.user) return;
      await this.notifications.notify({
        recipientUserId: employee.user.id,
        type: 'SYSTEM',
        title: 'Lid bo‘yicha bildirishnoma',
        message: `${leadName}: ${reasonUz}.`,
        referenceType: 'Lead',
        referenceId: leadId,
        actionUrl: `/leads/${leadId}`,
      });
    } catch (error) {
      this.logger.error(`Failed to notify lead assignee for ${leadId}: ${(error as Error).message}`);
    }
  }
}
