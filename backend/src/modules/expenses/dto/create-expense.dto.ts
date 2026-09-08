import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class CreateExpenseDto {
  @IsUUID()
  categoryId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsISO8601()
  expenseDate!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  vendorSupplierId?: string;

  @IsOptional()
  @IsUUID()
  responsibleEmployeeId?: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  receiptAttachmentUrl?: string;
}
