import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  defaultLanguage?: string;

  @IsOptional()
  @IsObject()
  taxSettings?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  invoiceSettings?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  notificationSettings?: Record<string, unknown>;
}
