import { apiClient } from './client';
import type { EmployeeActivity, EmployeeDetail, EmployeeListItem, EmployeeStatus, EmployeesOverview, PaginatedResult } from '../types';

export interface EmployeeQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  departmentId?: string;
  positionId?: string;
  status?: EmployeeStatus;
}

export interface CreateEmployeePayload {
  firstName: string;
  lastName: string;
  middleName?: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  departmentId?: string;
  positionId?: string;
  managerId?: string;
  hireDate: string;
  salary?: number;
  notes?: string;
}

export type UpdateEmployeePayload = Partial<CreateEmployeePayload> & { status?: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' };

export async function listEmployees(query: EmployeeQuery) {
  const { data } = await apiClient.get<PaginatedResult<EmployeeListItem>>('/employees', { params: query });
  return data;
}

export async function getEmployeesOverview() {
  const { data } = await apiClient.get<EmployeesOverview>('/employees/overview');
  return data;
}

export async function getEmployee(id: string) {
  const { data } = await apiClient.get<EmployeeDetail>(`/employees/${id}`);
  return data;
}

export async function getEmployeeActivity(id: string) {
  const { data } = await apiClient.get<EmployeeActivity>(`/employees/${id}/activity`);
  return data;
}

export async function createEmployee(payload: CreateEmployeePayload) {
  const { data } = await apiClient.post<EmployeeDetail>('/employees', payload);
  return data;
}

export async function updateEmployee(id: string, payload: UpdateEmployeePayload) {
  const { data } = await apiClient.patch<EmployeeDetail>(`/employees/${id}`, payload);
  return data;
}

export async function terminateEmployee(id: string) {
  const { data } = await apiClient.delete<EmployeeDetail>(`/employees/${id}`);
  return data;
}

export async function reactivateEmployee(id: string) {
  const { data } = await apiClient.post<EmployeeDetail>(`/employees/${id}/reactivate`);
  return data;
}
