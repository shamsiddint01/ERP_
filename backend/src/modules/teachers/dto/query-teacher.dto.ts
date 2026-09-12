import { TeacherProfileStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryTeacherDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TeacherProfileStatus)
  status?: TeacherProfileStatus;

  /** Derived filter — teachers who currently have at least one group at this branch. */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
