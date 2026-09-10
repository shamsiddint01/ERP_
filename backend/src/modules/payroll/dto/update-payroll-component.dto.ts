import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePayrollComponentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isPercentage?: boolean;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  defaultAmount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
