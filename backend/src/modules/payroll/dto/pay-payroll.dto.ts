import { PaymentMethod } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class PayPayrollDto {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;
}
