import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PERIOD } from './salary-period.dto.js';

export class RecordSalaryPaymentDto {
  @IsUUID()
  teacherEmployeeId!: string;

  @Matches(PERIOD, { message: 'period must look like 2026-10' })
  period!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
