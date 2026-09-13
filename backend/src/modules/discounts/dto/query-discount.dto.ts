import { DiscountType } from '@prisma/client';
import { IsBooleanString, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryDiscountDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DiscountType)
  type?: DiscountType;

  /** Plain query strings arrive as text — "true"/"false", not a boolean. */
  @IsOptional()
  @IsBooleanString()
  isActive?: string;
}
