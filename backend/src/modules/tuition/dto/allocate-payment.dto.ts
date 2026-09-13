import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsPositive, IsUUID, ValidateNested } from 'class-validator';

export class AllocationEntryDto {
  @IsUUID()
  tuitionChargeId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}

/** A payment may cover one charge or many — re-callable: allocating again for the same (payment, charge) pair corrects that allocation's amount in place rather than erroring as a duplicate. */
export class AllocatePaymentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AllocationEntryDto)
  allocations!: AllocationEntryDto[];
}
