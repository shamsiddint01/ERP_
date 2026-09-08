import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateExpenseCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;
}
