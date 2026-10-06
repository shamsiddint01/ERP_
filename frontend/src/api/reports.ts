import { apiClient } from './client';

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
  query: object,
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
