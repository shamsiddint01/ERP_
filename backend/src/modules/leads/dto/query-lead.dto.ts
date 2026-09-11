import { LeadStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryLeadDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsUUID()
  preferredCourseId?: string;

  @IsOptional()
  @IsUUID()
  preferredBranchId?: string;

  @IsOptional()
  @IsUUID()
  assignedEmployeeId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @IsOptional()
  @IsISO8601()
  followUpFrom?: string;

  @IsOptional()
  @IsISO8601()
  followUpTo?: string;
}
