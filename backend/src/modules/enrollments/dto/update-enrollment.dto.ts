import { IsISO8601, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** studentId/groupId are intentionally absent — moving an enrollment to a different group is what /transfer is for, not a field edit. */
export class UpdateEnrollmentDto {
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
