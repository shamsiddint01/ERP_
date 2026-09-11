import { apiClient } from './client';
import type { BranchDetail, BranchListItem, BranchStatus, PaginatedResult } from '../types';

export interface BranchQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: BranchStatus;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface BranchPayload {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  managerEmployeeId?: string;
  workingHours?: string;
  notes?: string;
  status?: BranchStatus;
}

export async function listBranches(query: BranchQuery) {
  const { data } = await apiClient.get<PaginatedResult<BranchListItem>>('/branches', { params: query });
  return data;
}

export async function getBranch(id: string) {
  const { data } = await apiClient.get<BranchDetail>(`/branches/${id}`);
  return data;
}

export async function createBranch(payload: BranchPayload) {
  const { data } = await apiClient.post<BranchDetail>('/branches', payload);
  return data;
}

export async function updateBranch(id: string, payload: Partial<BranchPayload>) {
  const { data } = await apiClient.patch<BranchDetail>(`/branches/${id}`, payload);
  return data;
}

export async function deactivateBranch(id: string) {
  const { data } = await apiClient.delete<BranchDetail>(`/branches/${id}`);
  return data;
}
