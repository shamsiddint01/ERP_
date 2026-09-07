import { apiClient } from './client';
import type { Warehouse } from '../types';

export async function listWarehouses() {
  const { data } = await apiClient.get<Warehouse[]>('/warehouses');
  return data;
}

export async function createWarehouse(payload: { name: string; code?: string; address?: string }) {
  const { data } = await apiClient.post<Warehouse>('/warehouses', payload);
  return data;
}

export async function updateWarehouse(id: string, payload: Partial<{ name: string; code: string; address: string; isActive: boolean }>) {
  const { data } = await apiClient.patch<Warehouse>(`/warehouses/${id}`, payload);
  return data;
}

export async function deactivateWarehouse(id: string) {
  const { data } = await apiClient.delete<Warehouse>(`/warehouses/${id}`);
  return data;
}
