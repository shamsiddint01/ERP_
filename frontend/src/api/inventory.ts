import { apiClient } from './client';
import type {
  InventorySummary,
  InventoryStockRow,
  PaginatedResult,
  StockMovement,
  StockMovementType,
  StockReferenceType,
  StockTransfer,
  StockTransferStatus,
} from '../types';

export interface StockQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  warehouseId?: string;
  productId?: string;
  lowStockOnly?: boolean;
}

export interface MovementsQuery {
  page?: number;
  pageSize?: number;
  productId?: string;
  warehouseId?: string;
  movementType?: StockMovementType;
  referenceType?: StockReferenceType;
}

export async function listStock(query: StockQuery) {
  const { data } = await apiClient.get<PaginatedResult<InventoryStockRow>>('/inventory', { params: query });
  return data;
}

export async function listMovements(query: MovementsQuery) {
  const { data } = await apiClient.get<PaginatedResult<StockMovement>>('/inventory/movements', { params: query });
  return data;
}

export async function getInventorySummary() {
  const { data } = await apiClient.get<InventorySummary>('/inventory/summary');
  return data;
}

export interface StockInPayload {
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCost?: number;
  referenceType?: StockReferenceType;
  note?: string;
}

export async function stockIn(payload: StockInPayload) {
  const { data } = await apiClient.post<StockMovement>('/inventory/stock-in', payload);
  return data;
}

export interface StockOutPayload {
  productId: string;
  warehouseId: string;
  quantity: number;
  referenceType?: StockReferenceType;
  note?: string;
}

export async function stockOut(payload: StockOutPayload) {
  const { data } = await apiClient.post<StockMovement>('/inventory/stock-out', payload);
  return data;
}

export interface AdjustPayload {
  productId: string;
  warehouseId: string;
  quantity: number;
  direction: 'INCREASE' | 'DECREASE';
  note?: string;
}

export async function adjustStock(payload: AdjustPayload) {
  const { data } = await apiClient.post<StockMovement>('/inventory/adjust', payload);
  return data;
}

export interface DamagePayload {
  productId: string;
  warehouseId: string;
  quantity: number;
  note: string;
}

export async function damageStock(payload: DamagePayload) {
  const { data } = await apiClient.post<StockMovement>('/inventory/damage', payload);
  return data;
}

export interface TransfersQuery {
  page?: number;
  pageSize?: number;
  status?: StockTransferStatus;
}

export async function listTransfers(query: TransfersQuery) {
  const { data } = await apiClient.get<PaginatedResult<StockTransfer>>('/inventory/transfers', { params: query });
  return data;
}

export interface CreateTransferPayload {
  fromWarehouseId: string;
  toWarehouseId: string;
  items: Array<{ productId: string; quantity: number }>;
}

export async function createTransfer(payload: CreateTransferPayload) {
  const { data } = await apiClient.post<StockTransfer>('/inventory/transfers', payload);
  return data;
}

export async function completeTransfer(id: string) {
  const { data } = await apiClient.post<StockTransfer>(`/inventory/transfers/${id}/complete`);
  return data;
}

export async function cancelTransfer(id: string) {
  const { data } = await apiClient.post<StockTransfer>(`/inventory/transfers/${id}/cancel`);
  return data;
}
