import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @IsIn(['ORDER', 'INVOICE', 'PURCHASE_ORDER'])
  referenceType!: 'ORDER' | 'INVOICE' | 'PURCHASE_ORDER';

  @IsUUID()
  referenceId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  externalTransactionId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
