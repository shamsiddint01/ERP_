import { describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service.js';

function make(dbOk: boolean, redisPong: string | Error) {
  const prisma = {
    $queryRaw: dbOk ? vi.fn().mockResolvedValue([{ '?column?': 1 }]) : vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
  };
  const redis = {
    client: {
      ping: vi.fn().mockImplementation(() => (redisPong instanceof Error ? Promise.reject(redisPong) : Promise.resolve(redisPong))),
    },
  };
  return new HealthService(prisma as never, redis as never);
}

describe('HealthService.readiness', () => {
  it('reports "ok" when the database and redis both respond', async () => {
    const result = await make(true, 'PONG').readiness();
    expect(result).toEqual({ status: 'ok', info: { database: { status: 'up' }, redis: { status: 'up' } } });
  });

  it('reports "degraded" (not fatal) when only redis is down — the RBAC cache falls back to Postgres', async () => {
    const result = await make(true, new Error('redis down')).readiness();
    expect(result.status).toBe('degraded');
    expect(result.info).toEqual({ database: { status: 'up' }, redis: { status: 'down' } });
  });

  it('reports "error" when the database is unreachable', async () => {
    const result = await make(false, 'PONG').readiness();
    expect(result.status).toBe('error');
    expect(result.info.database.status).toBe('down');
  });

  it('never returns a connection string or secret', async () => {
    const result = await make(false, new Error('x')).readiness();
    expect(JSON.stringify(result)).not.toMatch(/postgres:\/\/|redis:\/\/|password|DATABASE_URL/i);
  });
});
