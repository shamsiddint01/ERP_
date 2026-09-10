import { IsUUID } from 'class-validator';

export class CreatePayrollDto {
  @IsUUID()
  periodId!: string;

  @IsUUID()
  employeeId!: string;
}
