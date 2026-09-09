import { EmployeeStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsISO8601, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** status is intentionally restricted to the "free" transitions (ACTIVE/ON_LEAVE/SUSPENDED) — TERMINATED goes through DELETE, reactivation through its own endpoint. */
export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  middleName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsISO8601()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  positionId?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  salary?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  @IsIn(['ACTIVE', 'ON_LEAVE', 'SUSPENDED'])
  status?: EmployeeStatus;
}
