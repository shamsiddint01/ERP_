import { IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class TransferEnrollmentDto {
  @IsUUID()
  targetGroupId!: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

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
