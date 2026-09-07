import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsPositive, IsUUID, ValidateNested } from 'class-validator';

class ReceiveItemDto {
  @IsUUID()
  purchaseOrderItemId!: string;

  @IsPositive()
  quantityReceived!: number;
}

export class ReceivePurchaseOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items!: ReceiveItemDto[];
}
