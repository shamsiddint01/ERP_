import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** code/type/category are immutable once an account exists — reclassifying it would misrepresent posted history. */
export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPostable?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
