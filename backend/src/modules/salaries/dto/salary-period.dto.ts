import { IsOptional, Matches } from 'class-validator';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export class SalaryPeriodQueryDto {
  /** "YYYY-MM"; defaults to the current month (Tashkent time). */
  @IsOptional()
  @Matches(PERIOD, { message: 'period must look like 2026-10' })
  period?: string;
}

export { PERIOD };
