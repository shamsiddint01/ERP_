import { BranchStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryBranchDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(BranchStatus)
  status?: BranchStatus;
}
