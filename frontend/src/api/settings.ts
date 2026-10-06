import { apiClient } from './client';
import type { CompanySettings } from '../types';

export interface Branding {
  companyName: string;
  /** A data URL (data:image/png;base64,...) or null when no logo has been uploaded. */
  logoUrl: string | null;
}

export async function getSettings() {
  const { data } = await apiClient.get<CompanySettings>('/settings');
  return data;
}

export async function updateSettings(payload: Partial<Pick<CompanySettings, 'companyName' | 'currency' | 'defaultLanguage'>>) {
  const { data } = await apiClient.patch<CompanySettings>('/settings', payload);
  return data;
}

/** Public (no login needed) — the center's name and logo for the login page and the app shell. */
export async function getBranding() {
  const { data } = await apiClient.get<Branding>('/settings/branding');
  return data;
}

export async function uploadLogo(file: File) {
  const body = new FormData();
  body.append('file', file);
  const { data } = await apiClient.post<CompanySettings>('/settings/logo', body);
  return data;
}

export async function removeLogo() {
  const { data } = await apiClient.delete<CompanySettings>('/settings/logo');
  return data;
}
