import { apiClient } from './client';
import type { Category } from '../types';

export async function listCategories() {
  const { data } = await apiClient.get<Category[]>('/product-categories');
  return data;
}

export async function createCategory(payload: { name: string; parentCategoryId?: string }) {
  const { data } = await apiClient.post<Category>('/product-categories', payload);
  return data;
}

export async function updateCategory(id: string, payload: { name?: string; parentCategoryId?: string }) {
  const { data } = await apiClient.patch<Category>(`/product-categories/${id}`, payload);
  return data;
}

export async function deleteCategory(id: string) {
  await apiClient.delete(`/product-categories/${id}`);
}
