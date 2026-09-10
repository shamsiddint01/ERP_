import { PayrollLineType } from '@prisma/client';
import { IsEnum, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

/** Manually attaches a bonus/allowance/deduction line to a DRAFT payroll, before calculate() runs. */
export class AddPayrollLineDto {
  @IsEnum(PayrollLineType)
  @IsIn(['BONUS', 'ALLOWANCE', 'DEDUCTION'])
  type!: 'BONUS' | 'ALLOWANCE' | 'DEDUCTION';

  @IsOptional()
  @IsUUID()
  componentId?: string;

  @IsString()
  @MaxLength(150)
  label!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
