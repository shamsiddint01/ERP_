import { apiClient } from './client';
import type { PaginatedResult, Payment, PaymentMethod, PaymentStatus } from '../types';

export interface PaymentQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  customerId?: string;
  method?: PaymentMethod;
  status?: PaymentStatus;
  from?: string;
  to?: string;
}

export interface CreatePaymentPayload {
  referenceType: 'ORDER' | 'INVOICE';
  referenceId: string;
  amount: number;
  method: PaymentMethod;
  externalTransactionId?: string;
  notes?: string;
}

export async function listPayments(query: PaymentQuery) {
  const { data } = await apiClient.get<PaginatedResult<Payment>>('/payments', { params: query });
  return data;
}

export async function createPayment(payload: CreatePaymentPayload) {
  const { data } = await apiClient.post<Payment>('/payments', payload);
  return data;
}

export async function refundPayment(id: string) {
  const { data } = await apiClient.post<Payment>(`/payments/${id}/refund`);
  return data;
}
