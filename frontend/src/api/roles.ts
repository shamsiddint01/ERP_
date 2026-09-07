import { apiClient } from './client';
import type { PermissionActionValue, PermissionCatalog, RoleDetail, RoleListItem } from '../types';

export async function listRoles() {
  const { data } = await apiClient.get<RoleListItem[]>('/roles');
  return data;
}

export async function getRole(id: string) {
  const { data } = await apiClient.get<RoleDetail>(`/roles/${id}`);
  return data;
}

export async function getPermissionCatalog() {
  const { data } = await apiClient.get<PermissionCatalog>('/roles/permissions/catalog');
  return data;
}

export async function createRole(payload: { name: string; description?: string }) {
  const { data } = await apiClient.post<RoleListItem>('/roles', payload);
  return data;
}

export async function updateRolePermissions(id: string, permissions: Array<{ module: string; action: PermissionActionValue }>) {
  const { data } = await apiClient.put<RoleDetail>(`/roles/${id}/permissions`, { permissions });
  return data;
}

export async function deleteRole(id: string) {
  await apiClient.delete(`/roles/${id}`);
}
