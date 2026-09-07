import { IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class AdjustStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsIn(['INCREASE', 'DECREASE'])
  direction!: 'INCREASE' | 'DECREASE';

  @IsOptional()
  @IsString()
  note?: string;
}
