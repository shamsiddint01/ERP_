import { apiClient } from './client';
import type {
  BalanceSheetReport,
  CashFlowReport,
  GeneralLedgerReport,
  ProfitAndLossReport,
  ReconciliationReport,
  TrialBalanceReport,
} from '../types';

export interface ReportDateRangeQuery {
  from?: string;
  to?: string;
  accountId?: string;
}

export async function getGeneralLedger(query: ReportDateRangeQuery) {
  const { data } = await apiClient.get<GeneralLedgerReport>('/reports/general-ledger', { params: query });
  return data;
}

export async function getTrialBalance(query: ReportDateRangeQuery) {
  const { data } = await apiClient.get<TrialBalanceReport>('/reports/trial-balance', { params: query });
  return data;
}

export async function getProfitAndLoss(query: ReportDateRangeQuery) {
  const { data } = await apiClient.get<ProfitAndLossReport>('/reports/profit-and-loss', { params: query });
  return data;
}

export async function getBalanceSheet(query: ReportDateRangeQuery) {
  const { data } = await apiClient.get<BalanceSheetReport>('/reports/balance-sheet', { params: query });
  return data;
}

export async function getCashFlow(query: ReportDateRangeQuery) {
  const { data } = await apiClient.get<CashFlowReport>('/reports/cash-flow', { params: query });
  return data;
}

export async function getArReconciliation() {
  const { data } = await apiClient.get<ReconciliationReport>('/reports/ar-reconciliation');
  return data;
}

export async function getApReconciliation() {
  const { data } = await apiClient.get<ReconciliationReport>('/reports/ap-reconciliation');
  return data;
}

export interface StudentDebtRow {
  studentId: string;
  studentCode: string;
  fullName: string;
  totalBilled: number;
  discounts: number;
  paid: number;
  outstanding: number;
  overdue: number;
}

export interface StudentDebtReport {
  rows: StudentDebtRow[];
  totalBilled: number;
  paid: number;
  outstanding: number;
  overdue: number;
}

export async function getStudentDebtReport() {
  const { data } = await apiClient.get<StudentDebtReport>('/reports/student-debt');
  return data;
}

/** Fetches a report export as a blob (so the auth header goes along) and triggers a browser download. */
export async function downloadReportExport(
  reportPath: string,
  format: 'csv' | 'pdf',
  query: ReportDateRangeQuery,
  filename: string,
): Promise<void> {
  const response = await apiClient.get(`/reports/${reportPath}`, { params: { ...query, format }, responseType: 'blob' });
  const mimeType = format === 'pdf' ? 'application/pdf' : 'text/csv';
  const blobUrl = URL.createObjectURL(new Blob([response.data], { type: mimeType }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${filename}.${format}`;
  link.target = '_blank';
  link.click();
  URL.revokeObjectURL(blobUrl);
}
