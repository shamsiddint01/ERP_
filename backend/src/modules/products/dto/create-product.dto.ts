import { ProductStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsString()
  sku!: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  salePrice!: number;

  @IsNumber()
  @Min(0)
  costPrice!: number;

  @IsOptional()
  @IsUUID()
  taxRateId?: string;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockLevel?: number;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
