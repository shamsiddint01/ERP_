import { apiClient } from './client';
import type {
  PaginatedResult,
  PayrollComponentItem,
  PayrollComponentType,
  PayrollDetail,
  PayrollListItem,
  PayrollPeriod,
  PayrollPeriodStatus,
  PayrollPeriodSummary,
  PayrollStatus,
} from '../types';

// --- Periods ---

export interface PayrollPeriodQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: PayrollPeriodStatus;
}

export async function listPayrollPeriods(query: PayrollPeriodQuery) {
  const { data } = await apiClient.get<PaginatedResult<PayrollPeriod>>('/payroll-periods', { params: query });
  return data;
}

export async function getPayrollPeriod(id: string) {
  const { data } = await apiClient.get<PayrollPeriod>(`/payroll-periods/${id}`);
  return data;
}

export async function getPayrollPeriodSummary(id: string) {
  const { data } = await apiClient.get<PayrollPeriodSummary>(`/payroll-periods/${id}/summary`);
  return data;
}

export async function createPayrollPeriod(payload: { name: string; periodStart: string; periodEnd: string }) {
  const { data } = await apiClient.post<PayrollPeriod>('/payroll-periods', payload);
  return data;
}

export async function closePayrollPeriod(id: string) {
  const { data } = await apiClient.post<PayrollPeriod>(`/payroll-periods/${id}/close`);
  return data;
}

export async function reopenPayrollPeriod(id: string) {
  const { data } = await apiClient.post<PayrollPeriod>(`/payroll-periods/${id}/reopen`);
  return data;
}

// --- Components ---

export async function listPayrollComponents() {
  const { data } = await apiClient.get<PayrollComponentItem[]>('/payroll-components');
  return data;
}

export async function createPayrollComponent(payload: { name: string; type: PayrollComponentType; isPercentage?: boolean; defaultAmount?: number }) {
  const { data } = await apiClient.post<PayrollComponentItem>('/payroll-components', payload);
  return data;
}

export async function deletePayrollComponent(id: string) {
  await apiClient.delete(`/payroll-components/${id}`);
}

// --- Payroll ---

export interface PayrollQuery {
  page?: number;
  pageSize?: number;
  periodId?: string;
  employeeId?: string;
  departmentId?: string;
  status?: PayrollStatus;
}

export async function listPayroll(query: PayrollQuery) {
  const { data } = await apiClient.get<PaginatedResult<PayrollListItem>>('/payroll', { params: query });
  return data;
}

export async function getPayroll(id: string) {
  const { data } = await apiClient.get<PayrollDetail>(`/payroll/${id}`);
  return data;
}

export async function createPayroll(payload: { periodId: string; employeeId: string }) {
  const { data } = await apiClient.post<PayrollDetail>('/payroll', payload);
  return data;
}

export async function generatePayroll(payload: { periodId: string; employeeIds?: string[] }) {
  const { data } = await apiClient.post<{ periodId: string; created: number; skipped: number }>('/payroll/generate', payload);
  return data;
}

export async function addPayrollLine(payrollId: string, payload: { type: 'BONUS' | 'ALLOWANCE' | 'DEDUCTION'; componentId?: string; label: string; amount: number; notes?: string }) {
  const { data } = await apiClient.post<PayrollDetail>(`/payroll/${payrollId}/lines`, payload);
  return data;
}

export async function removePayrollLine(payrollId: string, lineId: string) {
  const { data } = await apiClient.delete<PayrollDetail>(`/payroll/${payrollId}/lines/${lineId}`);
  return data;
}

export async function calculatePayroll(id: string) {
  const { data } = await apiClient.post<PayrollDetail>(`/payroll/${id}/calculate`);
  return data;
}

export async function approvePayroll(id: string) {
  const { data } = await apiClient.post<PayrollDetail>(`/payroll/${id}/approve`);
  return data;
}

export async function payPayroll(id: string, method: string) {
  const { data } = await apiClient.post<PayrollDetail>(`/payroll/${id}/pay`, { method });
  return data;
}

export async function cancelPayroll(id: string, reason?: string) {
  const { data } = await apiClient.post<PayrollDetail>(`/payroll/${id}/cancel`, { reason });
  return data;
}

// --- Reports ---

export type PayrollReportType = 'summary' | 'by-employee' | 'by-department' | 'overtime' | 'allowances' | 'deductions' | 'bonuses' | 'payment-status' | 'expense';

export interface PayrollReportQuery {
  type: PayrollReportType;
  periodId?: string;
  departmentId?: string;
  employeeId?: string;
  status?: string;
}

export async function getPayrollReport(query: PayrollReportQuery) {
  const { data } = await apiClient.get('/payroll/reports', { params: query });
  return data;
}

export async function downloadPayrollReport(query: PayrollReportQuery): Promise<void> {
  const response = await apiClient.get('/payroll/reports', { params: { ...query, format: 'csv' }, responseType: 'blob' });
  const blobUrl = URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `payroll-${query.type}.csv`;
  link.target = '_blank';
  link.click();
  URL.revokeObjectURL(blobUrl);
}
