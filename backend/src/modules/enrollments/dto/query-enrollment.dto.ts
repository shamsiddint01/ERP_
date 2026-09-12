import { EnrollmentStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryEnrollmentDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  /** Derived filters — reach through the enrollment's group relation. */
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  teacherEmployeeId?: string;

  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
