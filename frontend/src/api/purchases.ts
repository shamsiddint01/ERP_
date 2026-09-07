import { apiClient } from './client';
import type { PaginatedResult, PurchaseOrder, PurchaseOrderStatus } from '../types';

export interface PurchaseOrderQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: PurchaseOrderStatus;
  supplierId?: string;
}

export interface PurchaseOrderItemPayload {
  productId: string;
  quantity: number;
  unitPrice: number;
  taxPercent?: number;
  discountAmount?: number;
}

export interface CreatePurchaseOrderPayload {
  supplierId: string;
  warehouseId: string;
  orderDate: string;
  expectedDate?: string;
  notes?: string;
  items: PurchaseOrderItemPayload[];
}

export async function listPurchaseOrders(query: PurchaseOrderQuery) {
  const { data } = await apiClient.get<PaginatedResult<PurchaseOrder>>('/purchases', { params: query });
  return data;
}

export async function getPurchaseOrder(id: string) {
  const { data } = await apiClient.get<PurchaseOrder>(`/purchases/${id}`);
  return data;
}

export async function createPurchaseOrder(payload: CreatePurchaseOrderPayload) {
  const { data } = await apiClient.post<PurchaseOrder>('/purchases', payload);
  return data;
}

export async function submitPurchaseOrder(id: string) {
  const { data } = await apiClient.post<PurchaseOrder>(`/purchases/${id}/submit`);
  return data;
}

export async function approvePurchaseOrder(id: string) {
  const { data } = await apiClient.post<PurchaseOrder>(`/purchases/${id}/approve`);
  return data;
}

export interface ReceiveItemPayload {
  purchaseOrderItemId: string;
  quantityReceived: number;
}

export async function receivePurchaseOrder(id: string, items: ReceiveItemPayload[]) {
  const { data } = await apiClient.post<PurchaseOrder>(`/purchases/${id}/receive`, { items });
  return data;
}

export async function cancelPurchaseOrder(id: string) {
  const { data } = await apiClient.post<PurchaseOrder>(`/purchases/${id}/cancel`);
  return data;
}
