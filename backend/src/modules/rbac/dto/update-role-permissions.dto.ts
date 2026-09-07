import { PermissionAction } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsString, ValidateNested } from 'class-validator';

class PermissionItemDto {
  @IsString()
  module!: string;

  @IsEnum(PermissionAction)
  action!: PermissionAction;
}

export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => PermissionItemDto)
  permissions!: PermissionItemDto[];
}
