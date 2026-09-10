import { SalaryType } from '@prisma/client';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class CreateCompensationDto {
  @IsUUID()
  employeeId!: string;

  @IsNumber()
  @IsPositive()
  baseSalary!: number;

  @IsEnum(SalaryType)
  salaryType!: SalaryType;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  overtimeRate?: number;

  @IsISO8601()
  effectiveFrom!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
