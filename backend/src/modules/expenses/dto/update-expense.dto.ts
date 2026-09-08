import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class UpdateExpenseDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsISO8601()
  expenseDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  vendorSupplierId?: string;

  @IsOptional()
  @IsUUID()
  responsibleEmployeeId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  receiptAttachmentUrl?: string;
}
