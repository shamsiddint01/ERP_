import { IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

/**
 * No `status` field on purpose — an enrollment always starts at the schema's
 * default (ACTIVE) and can only change through the dedicated workflow
 * endpoints (Phase D §14: "do not allow arbitrary status manipulation").
 */
export class CreateEnrollmentDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  groupId!: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  agreedTuition?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
