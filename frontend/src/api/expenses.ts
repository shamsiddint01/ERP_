import { apiClient } from './client';
import type { Expense, ExpenseCategoryItem, ExpenseStatus, PaginatedResult, PaymentMethod } from '../types';

export interface ExpenseQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ExpenseStatus;
  categoryId?: string;
  vendorSupplierId?: string;
  from?: string;
  to?: string;
}

export interface CreateExpensePayload {
  categoryId: string;
  amount: number;
  expenseDate: string;
  description?: string;
  vendorSupplierId?: string;
  responsibleEmployeeId?: string;
  paymentMethod: PaymentMethod;
  receiptAttachmentUrl?: string;
}

export type UpdateExpensePayload = Partial<CreateExpensePayload>;

export async function listExpenses(query: ExpenseQuery) {
  const { data } = await apiClient.get<PaginatedResult<Expense>>('/expenses', { params: query });
  return data;
}

export async function getExpense(id: string) {
  const { data } = await apiClient.get<Expense>(`/expenses/${id}`);
  return data;
}

export async function createExpense(payload: CreateExpensePayload) {
  const { data } = await apiClient.post<Expense>('/expenses', payload);
  return data;
}

export async function updateExpense(id: string, payload: UpdateExpensePayload) {
  const { data } = await apiClient.patch<Expense>(`/expenses/${id}`, payload);
  return data;
}

export async function submitExpense(id: string) {
  const { data } = await apiClient.post<Expense>(`/expenses/${id}/submit`);
  return data;
}

export async function approveExpense(id: string) {
  const { data } = await apiClient.post<Expense>(`/expenses/${id}/approve`);
  return data;
}

export async function rejectExpense(id: string) {
  const { data } = await apiClient.post<Expense>(`/expenses/${id}/reject`);
  return data;
}

export async function payExpense(id: string) {
  const { data } = await apiClient.post<Expense>(`/expenses/${id}/pay`);
  return data;
}

export async function cancelExpense(id: string) {
  const { data } = await apiClient.post<Expense>(`/expenses/${id}/cancel`);
  return data;
}

export async function listExpenseCategories() {
  const { data } = await apiClient.get<ExpenseCategoryItem[]>('/expense-categories');
  return data;
}

export async function createExpenseCategory(payload: { name: string; accountId?: string }) {
  const { data } = await apiClient.post<ExpenseCategoryItem>('/expense-categories', payload);
  return data;
}

export async function updateExpenseCategory(id: string, payload: { name?: string; accountId?: string }) {
  const { data } = await apiClient.patch<ExpenseCategoryItem>(`/expense-categories/${id}`, payload);
  return data;
}

export async function removeExpenseCategory(id: string) {
  await apiClient.delete(`/expense-categories/${id}`);
}
