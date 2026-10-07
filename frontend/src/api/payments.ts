import { apiClient } from './client';
import type { PaginatedResult, Payment, PaymentMethod, PaymentStatus } from '../types';

export interface PaymentQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  method?: PaymentMethod;
  status?: PaymentStatus;
  /** To'langan (completed) / To'lanmagan (anything else). */
  paymentState?: 'PAID' | 'UNPAID';
  from?: string;
  to?: string;
  referenceType?: 'TUITION_CHARGE';
  referenceId?: string;
}

export interface CreatePaymentPayload {
  referenceType: 'TUITION_CHARGE';
  /** The payer Student's id, not a specific charge — see AllocatePaymentPayload for per-charge assignment. */
  referenceId: string;
  amount: number;
  method: PaymentMethod;
  externalTransactionId?: string;
  notes?: string;
}

export interface AllocationEntry {
  tuitionChargeId: string;
  amount: number;
}

export interface AllocatePaymentPayload {
  allocations: AllocationEntry[];
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

export async function allocatePayment(id: string, payload: AllocatePaymentPayload) {
  const { data } = await apiClient.post(`/payments/${id}/allocate`, payload);
  return data;
}
