import { DepartmentStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryDepartmentDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;
}
