import { apiClient } from './client';
import type { DashboardSummary, RevenueChartPoint } from '../types';

export async function getDashboardSummary() {
  const { data } = await apiClient.get<DashboardSummary>('/dashboard/summary');
  return data;
}

export async function getRevenueChart(days = 14) {
  const { data } = await apiClient.get<RevenueChartPoint[]>('/dashboard/revenue-chart', { params: { days } });
  return data;
}
