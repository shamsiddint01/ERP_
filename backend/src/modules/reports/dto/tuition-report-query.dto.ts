import { IsIn, IsISO8601, IsOptional, Matches } from 'class-validator';

const BILLING_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export class TuitionReportQueryDto {
  /** Billed/outstanding/overdue reports: narrows by TuitionCharge.billingPeriod (a "YYYY-MM" bucket, not a DateTime — see TuitionCharge's own doc comment). */
  @IsOptional()
  @Matches(BILLING_PERIOD_PATTERN, { message: 'billingPeriodFrom must be in YYYY-MM format' })
  billingPeriodFrom?: string;

  @IsOptional()
  @Matches(BILLING_PERIOD_PATTERN, { message: 'billingPeriodTo must be in YYYY-MM format' })
  billingPeriodTo?: string;

  /** Collected report only: narrows by TuitionAllocation.createdAt (when the money was actually applied). */
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /**
   * Response format. Declared here purely so the global forbidNonWhitelisted
   * ValidationPipe doesn't 400 the request — the controller reads it via its
   * own `@Query('format')` param (see ReportDateRangeDto for the identical,
   * already-established precedent).
   */
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: string;
}
