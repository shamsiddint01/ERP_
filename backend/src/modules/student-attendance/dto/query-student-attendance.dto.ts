import { StudentAttendanceStatus } from '@prisma/client';
import { IsEnum, IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryStudentAttendanceDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  lessonId?: string;

  /** Filters via lesson.groupId. */
  @IsOptional()
  @IsUUID()
  groupId?: string;

  /** Filters via lesson.teacherEmployeeId. */
  @IsOptional()
  @IsUUID()
  teacherEmployeeId?: string;

  /** Filters via lesson.branchId. */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(StudentAttendanceStatus)
  status?: StudentAttendanceStatus;

  /** Filters on lesson.scheduledStart. */
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  /**
   * Response format — only meaningful on GET /student-attendance/summary.
   * Declared here purely so the global forbidNonWhitelisted ValidationPipe
   * doesn't 400 the request; the controller reads it via its own
   * `@Query('format')` param (mirrors ReportDateRangeDto).
   */
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: string;
}
