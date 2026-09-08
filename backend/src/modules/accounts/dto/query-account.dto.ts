import { AccountCategory, AccountType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryAccountDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @IsOptional()
  @IsEnum(AccountCategory)
  category?: AccountCategory;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
