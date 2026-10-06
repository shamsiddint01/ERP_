import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export const SUPPORTED_CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB'] as const;
export const SUPPORTED_LANGUAGES = ['uz', 'ru', 'en'] as const;

/**
 * The time zone is not editable: the product is sold only in Uzbekistan, so it
 * stays at the Asia/Tashkent default. The logo is deliberately not editable
 * here — it only changes through POST/DELETE /settings/logo, which validate the image.
 */
export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  companyName?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: string;

  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  defaultLanguage?: string;
}
