import { IsBoolean, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Matches } from 'class-validator';

const BILLING_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CreateTuitionChargeDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  enrollmentId!: string;

  @Matches(BILLING_PERIOD_PATTERN, { message: 'billingPeriod must be in YYYY-MM format' })
  billingPeriod!: string;

  /** Gross amount before discount. Defaults to the enrollment's own agreedTuition when omitted. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsISO8601()
  dueDate!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Explicit escape hatch for the "same student+enrollment+billingPeriod" duplicate check — spec: "unless explicitly overridden by a safe business rule". Defaults to false. */
  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;
}
