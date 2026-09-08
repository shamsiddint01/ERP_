import { apiClient } from './client';
import type { Account, AccountCategory, AccountType, PaginatedResult } from '../types';

export interface AccountQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: AccountType;
  category?: AccountCategory;
  isActive?: boolean;
}

export interface CreateAccountPayload {
  code: string;
  name: string;
  type: AccountType;
  category: AccountCategory;
  parentId?: string;
  description?: string;
  isPostable?: boolean;
  openingBalance?: number;
}

export interface UpdateAccountPayload {
  name?: string;
  parentId?: string;
  description?: string;
  isPostable?: boolean;
  isActive?: boolean;
}

export async function listAccounts(query: AccountQuery) {
  const { data } = await apiClient.get<PaginatedResult<Account>>('/accounts', { params: query });
  return data;
}

export async function getAccountTree() {
  const { data } = await apiClient.get<Account[]>('/accounts/tree');
  return data;
}

export async function createAccount(payload: CreateAccountPayload) {
  const { data } = await apiClient.post<Account>('/accounts', payload);
  return data;
}

export async function updateAccount(id: string, payload: UpdateAccountPayload) {
  const { data } = await apiClient.patch<Account>(`/accounts/${id}`, payload);
  return data;
}

export async function deactivateAccount(id: string) {
  const { data } = await apiClient.delete<Account>(`/accounts/${id}`);
  return data;
}
