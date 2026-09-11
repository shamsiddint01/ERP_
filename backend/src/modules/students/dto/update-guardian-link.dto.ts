import { GuardianRelationship } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class UpdateGuardianLinkDto {
  @IsOptional()
  @IsEnum(GuardianRelationship)
  relationship?: GuardianRelationship;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
