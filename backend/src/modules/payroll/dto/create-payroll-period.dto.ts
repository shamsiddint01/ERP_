import { IsISO8601, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePayrollPeriodDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;
}
