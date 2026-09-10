import { PayrollPeriodStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryPayrollPeriodDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PayrollPeriodStatus)
  status?: PayrollPeriodStatus;
}
