import { apiClient } from './client';
import type { PaginatedResult, StudentBalance, StudentFinancialSummary, TuitionCharge, TuitionChargeStatus } from '../types';

export interface TuitionChargeQuery {
  page?: number;
  pageSize?: number;
  studentId?: string;
  enrollmentId?: string;
  status?: TuitionChargeStatus;
  billingPeriod?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
}

export interface CreateTuitionChargePayload {
  studentId: string;
  enrollmentId: string;
  billingPeriod: string;
  amount?: number;
  dueDate: string;
  description?: string;
  allowDuplicate?: boolean;
}

export interface UpdateTuitionChargePayload {
  dueDate?: string;
  description?: string;
}

export async function listTuitionCharges(query: TuitionChargeQuery) {
  const { data } = await apiClient.get<PaginatedResult<TuitionCharge>>('/tuition', { params: query });
  return data;
}

export async function getTuitionCharge(id: string) {
  const { data } = await apiClient.get<TuitionCharge>(`/tuition/${id}`);
  return data;
}

export async function createTuitionCharge(payload: CreateTuitionChargePayload) {
  const { data } = await apiClient.post<TuitionCharge>('/tuition', payload);
  return data;
}

export async function updateTuitionCharge(id: string, payload: UpdateTuitionChargePayload) {
  const { data } = await apiClient.patch<TuitionCharge>(`/tuition/${id}`, payload);
  return data;
}

export async function cancelTuitionCharge(id: string) {
  const { data } = await apiClient.post<TuitionCharge>(`/tuition/${id}/cancel`);
  return data;
}

export async function getStudentBalance(studentId: string) {
  const { data } = await apiClient.get<StudentBalance>(`/students/${studentId}/balance`);
  return data;
}

export async function getStudentFinancialSummary(studentId: string) {
  const { data } = await apiClient.get<StudentFinancialSummary>(`/students/${studentId}/financial-summary`);
  return data;
}
