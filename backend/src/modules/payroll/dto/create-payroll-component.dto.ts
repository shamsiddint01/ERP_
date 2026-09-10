import { PayrollComponentType } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePayrollComponentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsEnum(PayrollComponentType)
  type!: PayrollComponentType;

  @IsOptional()
  @IsBoolean()
  isPercentage?: boolean;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  defaultAmount?: number;
}
