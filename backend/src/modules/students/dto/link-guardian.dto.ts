import { GuardianRelationship } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class LinkGuardianDto {
  @IsUUID()
  guardianId!: string;

  @IsOptional()
  @IsEnum(GuardianRelationship)
  relationship?: GuardianRelationship;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
