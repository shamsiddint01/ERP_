import { apiClient } from './client';
import type { EmployeeCompensation, PaginatedResult, SalaryType } from '../types';

export interface CompensationQuery {
  page?: number;
  pageSize?: number;
  employeeId?: string;
}

export interface CreateCompensationPayload {
  employeeId: string;
  baseSalary: number;
  salaryType: SalaryType;
  overtimeRate?: number;
  effectiveFrom: string;
  notes?: string;
}

export async function listCompensation(query: CompensationQuery) {
  const { data } = await apiClient.get<PaginatedResult<EmployeeCompensation>>('/compensation', { params: query });
  return data;
}

export async function createCompensation(payload: CreateCompensationPayload) {
  const { data } = await apiClient.post<EmployeeCompensation>('/compensation', payload);
  return data;
}

export async function updateCompensation(id: string, payload: { notes?: string }) {
  const { data } = await apiClient.patch<EmployeeCompensation>(`/compensation/${id}`, payload);
  return data;
}

export async function deleteCompensation(id: string) {
  await apiClient.delete(`/compensation/${id}`);
}
