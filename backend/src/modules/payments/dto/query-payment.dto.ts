import { PaymentMethod, PaymentProcessingStatus, PaymentReferenceType } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryPaymentDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PaymentReferenceType)
  referenceType?: PaymentReferenceType;

  /** Filters to one student's payments. */
  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentProcessingStatus)
  status?: PaymentProcessingStatus;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
