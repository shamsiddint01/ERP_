import { apiClient } from './client';

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actor: { id: string; fullName: string; username: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  description: string | null;
  createdAt: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listAuditLogs(page: number, pageSize: number, filters?: { entityType?: string; entityId?: string }) {
  const { data } = await apiClient.get<AuditLogPage>('/audit-logs', { params: { page, pageSize, ...filters } });
  return data;
}
