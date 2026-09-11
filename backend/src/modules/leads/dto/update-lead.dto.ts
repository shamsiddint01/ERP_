import { IsEmail, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

/** Status is changed only via the dedicated PATCH :id/status endpoint, never here. */
export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUUID()
  preferredCourseId?: string;

  @IsOptional()
  @IsUUID()
  preferredBranchId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsUUID()
  assignedEmployeeId?: string;

  @IsOptional()
  @IsISO8601()
  nextFollowUpAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
