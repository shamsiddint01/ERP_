import { apiClient } from './client';
import type { DashboardCharts, DashboardOverview, DashboardToday } from '../types';

export async function getDashboardOverview() {
  const { data } = await apiClient.get<DashboardOverview>('/dashboard/overview');
  return data;
}

export async function getDashboardToday() {
  const { data } = await apiClient.get<DashboardToday>('/dashboard/today');
  return data;
}

export async function getDashboardCharts() {
  const { data } = await apiClient.get<DashboardCharts>('/dashboard/charts');
  return data;
}
