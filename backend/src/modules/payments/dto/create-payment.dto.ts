import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @IsIn(['TUITION_CHARGE'])
  referenceType!: 'TUITION_CHARGE';

  /** The payer Student's id — not a specific charge (see POST /payments/:id/allocate). */
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
