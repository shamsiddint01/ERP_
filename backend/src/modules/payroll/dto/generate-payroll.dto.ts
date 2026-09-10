import { IsArray, IsOptional, IsUUID } from 'class-validator';

/** Bulk-creates DRAFT payroll rows for a period. If employeeIds is omitted, generates for every ACTIVE employee who doesn't already have a payroll in this period. */
export class GeneratePayrollDto {
  @IsUUID()
  periodId!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  employeeIds?: string[];
}
