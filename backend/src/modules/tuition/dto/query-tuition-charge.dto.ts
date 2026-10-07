import { TuitionChargeStatus } from '@prisma/client';
import { IsEnum, IsIn, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryTuitionChargeDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsOptional()
  @IsEnum(TuitionChargeStatus)
  status?: TuitionChargeStatus;

  /** The two states the app shows: PAID = fully paid, UNPAID = anything still owed (pending, partly paid, overdue). */
  @IsOptional()
  @IsIn(['PAID', 'UNPAID'])
  paymentState?: 'PAID' | 'UNPAID';

  @IsOptional()
  @IsString()
  billingPeriod?: string;

  /** Filters on dueDate. */
  @IsOptional()
  @IsISO8601()
  dueDateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dueDateTo?: string;
}
