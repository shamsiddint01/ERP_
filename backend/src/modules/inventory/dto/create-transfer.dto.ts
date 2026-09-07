import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsPositive, IsUUID, ValidateNested } from 'class-validator';

class TransferItemDto {
  @IsUUID()
  productId!: string;

  @IsPositive()
  quantity!: number;
}

export class CreateTransferDto {
  @IsUUID()
  fromWarehouseId!: string;

  @IsUUID()
  toWarehouseId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items!: TransferItemDto[];
}
