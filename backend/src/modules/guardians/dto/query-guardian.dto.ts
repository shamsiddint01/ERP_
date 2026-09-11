import { GuardianStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryGuardianDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(GuardianStatus)
  status?: GuardianStatus;
}
