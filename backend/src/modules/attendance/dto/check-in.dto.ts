import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CheckInDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
