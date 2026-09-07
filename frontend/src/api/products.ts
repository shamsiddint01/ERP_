import { apiClient } from './client';
import type { PaginatedResult, ProductDetail, ProductListItem, ProductStatus } from '../types';

export interface ProductQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  status?: ProductStatus;
  lowStockOnly?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface ProductPayload {
  name: string;
  sku: string;
  barcode?: string;
  categoryId?: string;
  description?: string;
  salePrice: number;
  costPrice: number;
  unit: string;
  minStockLevel?: number;
  status?: ProductStatus;
}

export async function listProducts(query: ProductQuery) {
  const { data } = await apiClient.get<PaginatedResult<ProductListItem>>('/products', { params: query });
  return data;
}

export async function getProduct(id: string) {
  const { data } = await apiClient.get<ProductDetail>(`/products/${id}`);
  return data;
}

export async function createProduct(payload: ProductPayload) {
  const { data } = await apiClient.post<ProductDetail>('/products', payload);
  return data;
}

export async function updateProduct(id: string, payload: Partial<ProductPayload>) {
  const { data } = await apiClient.patch<ProductDetail>(`/products/${id}`, payload);
  return data;
}

export async function deactivateProduct(id: string) {
  const { data } = await apiClient.delete<ProductDetail>(`/products/${id}`);
  return data;
}
