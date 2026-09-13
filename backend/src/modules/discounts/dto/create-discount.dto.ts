import { DiscountType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateDiscountDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(DiscountType)
  type!: DiscountType;

  /**
   * A percentage (0-100) for type=PERCENTAGE; a flat currency amount for
   * every other type. The <=100 cap for PERCENTAGE is enforced in
   * DiscountsService (a cross-field rule class-validator can't express
   * cleanly with "always required, conditionally capped" semantics).
   */
  @IsNumber()
  @Min(0)
  value!: number;

  @IsOptional()
  @IsString()
  description?: string;
}
