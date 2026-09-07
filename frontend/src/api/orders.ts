import { apiClient } from './client';
import type { Order, OrderPaymentStatus, OrderStatus, PaginatedResult } from '../types';

export interface OrderQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: OrderStatus;
  paymentStatus?: OrderPaymentStatus;
  customerId?: string;
  from?: string;
  to?: string;
}

export interface OrderItemPayload {
  productId: string;
  quantity: number;
  unitPrice: number;
  taxPercent?: number;
  discountAmount?: number;
}

export interface CreateOrderPayload {
  customerId: string;
  warehouseId: string;
  orderDate: string;
  notes?: string;
  items: OrderItemPayload[];
}

export async function listOrders(query: OrderQuery) {
  const { data } = await apiClient.get<PaginatedResult<Order>>('/orders', { params: query });
  return data;
}

export async function getOrder(id: string) {
  const { data } = await apiClient.get<Order>(`/orders/${id}`);
  return data;
}

export async function createOrder(payload: CreateOrderPayload) {
  const { data } = await apiClient.post<Order>('/orders', payload);
  return data;
}

export async function confirmOrder(id: string) {
  const { data } = await apiClient.post<Order>(`/orders/${id}/confirm`);
  return data;
}

export async function processOrder(id: string) {
  const { data } = await apiClient.post<Order>(`/orders/${id}/process`);
  return data;
}

export async function completeOrder(id: string) {
  const { data } = await apiClient.post<Order>(`/orders/${id}/complete`);
  return data;
}

export async function cancelOrder(id: string, reason: string) {
  const { data } = await apiClient.post<Order>(`/orders/${id}/cancel`, { reason });
  return data;
}
