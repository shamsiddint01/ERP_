import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class LinkProductDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsString()
  supplierSku?: string;

  @IsNumber()
  @Min(0)
  unitCost!: number;
}
