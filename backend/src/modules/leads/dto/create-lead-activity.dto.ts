import { LeadActivityType } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateLeadActivityDto {
  @IsEnum(LeadActivityType)
  type!: LeadActivityType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
