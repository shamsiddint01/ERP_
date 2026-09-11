import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Only the fields a Lead genuinely can't supply. Everything else (phone,
 * email, preferred branch/course) is carried over from the Lead itself by
 * the service — see Part 16 of the Phase B spec: never invent birth date,
 * gender, guardians, enrollment or payment data here.
 */
export class ConvertLeadDto {
  @IsOptional()
  @IsString()
  studentCode?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsISO8601()
  dateOfBirth?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
