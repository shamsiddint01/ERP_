import { TransactionReferenceType } from '@prisma/client';
import { IsEnum, IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class ReportDateRangeDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  /** General Ledger only — narrows to journal entries raised by one kind of source document. */
  @IsOptional()
  @IsEnum(TransactionReferenceType)
  referenceType?: TransactionReferenceType;

  /**
   * Response format. Declared here purely so the global forbidNonWhitelisted
   * ValidationPipe doesn't 400 the request — the controller reads it via its
   * own `@Query('format')` param.
   */
  @IsOptional()
  @IsIn(['json', 'csv', 'pdf'])
  format?: string;
}
