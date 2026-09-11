import { IsEmail, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  fullName!: string;

  @IsString()
  phone!: string;

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
