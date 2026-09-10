import { IsOptional, IsString } from 'class-validator';

export class CancelPayrollDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
