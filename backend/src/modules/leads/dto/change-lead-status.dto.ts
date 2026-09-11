import { LeadStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ChangeLeadStatusDto {
  @IsEnum(LeadStatus)
  status!: LeadStatus;
}
