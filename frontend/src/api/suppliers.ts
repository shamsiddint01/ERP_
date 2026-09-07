import { apiClient } from './client';
import type { PaginatedResult, SupplierDetail, SupplierHistory, SupplierListItem, SupplierStatus } from '../types';

export interface SupplierQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: SupplierStatus;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface SupplierPayload {
  companyName: string;
  contactPerson: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  status?: SupplierStatus;
}

export async function listSuppliers(query: SupplierQuery) {
  const { data } = await apiClient.get<PaginatedResult<SupplierListItem>>('/suppliers', { params: query });
  return data;
}

export async function getSupplier(id: string) {
  const { data } = await apiClient.get<SupplierDetail>(`/suppliers/${id}`);
  return data;
}

export async function getSupplierHistory(id: string) {
  const { data } = await apiClient.get<SupplierHistory>(`/suppliers/${id}/history`);
  return data;
}

export async function createSupplier(payload: SupplierPayload) {
  const { data } = await apiClient.post<SupplierDetail>('/suppliers', payload);
  return data;
}

export async function updateSupplier(id: string, payload: Partial<SupplierPayload>) {
  const { data } = await apiClient.patch<SupplierDetail>(`/suppliers/${id}`, payload);
  return data;
}

export async function deactivateSupplier(id: string) {
  const { data } = await apiClient.delete<SupplierDetail>(`/suppliers/${id}`);
  return data;
}

export async function linkSupplierProduct(id: string, payload: { productId: string; unitCost: number; supplierSku?: string }) {
  const { data } = await apiClient.post(`/suppliers/${id}/products`, payload);
  return data;
}

export async function unlinkSupplierProduct(id: string, productId: string) {
  await apiClient.delete(`/suppliers/${id}/products/${productId}`);
}
