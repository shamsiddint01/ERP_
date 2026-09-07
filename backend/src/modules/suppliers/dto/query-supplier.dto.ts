import { SupplierStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QuerySupplierDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SupplierStatus)
  status?: SupplierStatus;
}
