import { IsIn, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

/**
 * The one shared filter shape every /reports/education/* endpoint accepts
 * (spec: "Support: from, to, branch, course, group, teacher, student,
 * status" — server-side, applied directly in Prisma `where` clauses, never
 * filtered client-side after an unfiltered fetch). `status` is deliberately
 * a plain string here rather than one specific enum — each report method
 * validates it against whichever enum is actually relevant to that report
 * (StudentStatus for the students report, LeadStatus for admissions, etc.)
 * and throws a clear BadRequestException for a value that doesn't belong to
 * that enum, rather than silently ignoring a typo.
 */
export class EducationReportQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  teacherEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  /**
   * Response format. Declared here purely so the global forbidNonWhitelisted
   * ValidationPipe doesn't 400 the request — the controller reads it via its
   * own `@Query('format')` param (see ReportDateRangeDto/TuitionReportQueryDto
   * for the identical, already-established precedent).
   */
  @IsOptional()
  @IsIn(['json', 'csv', 'pdf'])
  format?: string;
}
