import { apiClient } from './client';
import type { DepartmentDetail, DepartmentListItem, DepartmentStatus, PaginatedResult } from '../types';

export interface DepartmentQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: DepartmentStatus;
}

export interface CreateDepartmentPayload {
  name: string;
  code: string;
  description?: string;
}

export interface UpdateDepartmentPayload {
  name?: string;
  description?: string;
  status?: DepartmentStatus;
  managerEmployeeId?: string;
}

export async function listDepartments(query: DepartmentQuery) {
  const { data } = await apiClient.get<PaginatedResult<DepartmentListItem>>('/departments', { params: query });
  return data;
}

export async function getDepartment(id: string) {
  const { data } = await apiClient.get<DepartmentDetail>(`/departments/${id}`);
  return data;
}

export async function createDepartment(payload: CreateDepartmentPayload) {
  const { data } = await apiClient.post<DepartmentListItem>('/departments', payload);
  return data;
}

export async function updateDepartment(id: string, payload: UpdateDepartmentPayload) {
  const { data } = await apiClient.patch<DepartmentListItem>(`/departments/${id}`, payload);
  return data;
}

export async function deactivateDepartment(id: string) {
  const { data } = await apiClient.delete<DepartmentListItem>(`/departments/${id}`);
  return data;
}
