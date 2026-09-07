import { apiClient } from './client';
import type { Invoice, InvoiceStatus, PaginatedResult } from '../types';

export interface InvoiceQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: InvoiceStatus;
  customerId?: string;
  from?: string;
  to?: string;
}

export async function listInvoices(query: InvoiceQuery) {
  const { data } = await apiClient.get<PaginatedResult<Invoice>>('/invoices', { params: query });
  return data;
}

export async function getInvoice(id: string) {
  const { data } = await apiClient.get<Invoice>(`/invoices/${id}`);
  return data;
}

export async function sendInvoice(id: string) {
  const { data } = await apiClient.post<Invoice>(`/invoices/${id}/send`);
  return data;
}

export async function voidInvoice(id: string) {
  const { data } = await apiClient.post<Invoice>(`/invoices/${id}/void`);
  return data;
}

/** Fetches the PDF as a blob (so the auth header goes along) and opens it in a new tab. */
export async function openInvoicePdf(id: string, invoiceNumber: string) {
  const response = await apiClient.get(`/invoices/${id}/pdf`, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${invoiceNumber}.pdf`;
  link.target = '_blank';
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
}
