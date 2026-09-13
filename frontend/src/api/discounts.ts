import { apiClient } from './client';
import type { Discount, DiscountType, PaginatedResult, StudentDiscount } from '../types';

export interface DiscountQuery {
  page?: number;
  pageSize?: number;
  type?: DiscountType;
  isActive?: boolean;
  search?: string;
}

export interface CreateDiscountPayload {
  name: string;
  type: DiscountType;
  value: number;
  description?: string;
}

export interface UpdateDiscountPayload {
  name?: string;
  type?: DiscountType;
  value?: number;
  description?: string;
  isActive?: boolean;
}

export interface GrantDiscountPayload {
  discountId: string;
  enrollmentId?: string;
  startDate: string;
  endDate?: string;
  notes?: string;
}

export async function listDiscounts(query: DiscountQuery) {
  const { data } = await apiClient.get<PaginatedResult<Discount>>('/discounts', {
    params: { ...query, isActive: query.isActive === undefined ? undefined : String(query.isActive) },
  });
  return data;
}

export async function getDiscount(id: string) {
  const { data } = await apiClient.get<Discount>(`/discounts/${id}`);
  return data;
}

export async function createDiscount(payload: CreateDiscountPayload) {
  const { data } = await apiClient.post<Discount>('/discounts', payload);
  return data;
}

export async function updateDiscount(id: string, payload: UpdateDiscountPayload) {
  const { data } = await apiClient.patch<Discount>(`/discounts/${id}`, payload);
  return data;
}

export async function deactivateDiscount(id: string) {
  const { data } = await apiClient.delete<Discount>(`/discounts/${id}`);
  return data;
}

export async function listStudentDiscounts(studentId: string) {
  const { data } = await apiClient.get<StudentDiscount[]>(`/students/${studentId}/discounts`);
  return data;
}

export async function grantStudentDiscount(studentId: string, payload: GrantDiscountPayload) {
  const { data } = await apiClient.post<StudentDiscount>(`/students/${studentId}/discounts`, payload);
  return data;
}

export async function revokeStudentDiscount(studentId: string, studentDiscountId: string) {
  const { data } = await apiClient.delete<StudentDiscount>(`/students/${studentId}/discounts/${studentDiscountId}`);
  return data;
}
