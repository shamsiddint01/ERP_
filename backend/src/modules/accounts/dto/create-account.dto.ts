import { AccountCategory, AccountType } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @Matches(/^[0-9]{3,10}$/, { message: 'code must be 3-10 digits' })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsEnum(AccountType)
  type!: AccountType;

  @IsEnum(AccountCategory)
  category!: AccountCategory;

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
  @IsNumber()
  openingBalance?: number;
}
