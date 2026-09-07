import { apiClient } from './client';
import type { CustomerDetail, CustomerHistory, CustomerListItem, CustomerStatus, PaginatedResult } from '../types';

export interface CustomerQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: CustomerStatus;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface CustomerPayload {
  name: string;
  companyName?: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  creditLimit?: number;
  status?: CustomerStatus;
}

export async function listCustomers(query: CustomerQuery) {
  const { data } = await apiClient.get<PaginatedResult<CustomerListItem>>('/customers', { params: query });
  return data;
}

export async function getCustomer(id: string) {
  const { data } = await apiClient.get<CustomerDetail>(`/customers/${id}`);
  return data;
}

export async function getCustomerHistory(id: string) {
  const { data } = await apiClient.get<CustomerHistory>(`/customers/${id}/history`);
  return data;
}

export async function createCustomer(payload: CustomerPayload) {
  const { data } = await apiClient.post<CustomerDetail>('/customers', payload);
  return data;
}

export async function updateCustomer(id: string, payload: Partial<CustomerPayload>) {
  const { data } = await apiClient.patch<CustomerDetail>(`/customers/${id}`, payload);
  return data;
}

export async function deactivateCustomer(id: string) {
  const { data } = await apiClient.delete<CustomerDetail>(`/customers/${id}`);
  return data;
}
