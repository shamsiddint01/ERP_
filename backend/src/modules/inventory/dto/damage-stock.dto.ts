import { IsNumber, IsPositive, IsString, IsUUID } from 'class-validator';

export class DamageStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsString()
  note!: string;
}
