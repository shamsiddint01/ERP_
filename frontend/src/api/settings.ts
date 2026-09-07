import { apiClient } from './client';
import type { CompanySettings } from '../types';

export async function getSettings() {
  const { data } = await apiClient.get<CompanySettings>('/settings');
  return data;
}

export async function updateSettings(payload: Partial<CompanySettings>) {
  const { data } = await apiClient.patch<CompanySettings>('/settings', payload);
  return data;
}
