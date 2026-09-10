import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';

export type ComponentStatus = 'up' | 'down';

export interface ReadinessResult {
  status: 'ok' | 'degraded' | 'error';
  info: {
    database: { status: ComponentStatus };
    redis: { status: ComponentStatus };
  };
}

/**
 * Minimal readiness check — no external health library. `database` failing is
 * fatal (status "error", the controller answers 503). `redis` failing is only
 * "degraded": it backs the RBAC permission cache, which falls back to Postgres,
 * so the app still serves traffic. Never returns connection strings or secrets.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async readiness(): Promise<ReadinessResult> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);

    const status = database === 'down' ? 'error' : redis === 'down' ? 'degraded' : 'ok';
    return { status, info: { database: { status: database }, redis: { status: redis } } };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch (error) {
      this.logger.error(`Database readiness check failed: ${(error as Error).message}`);
      return 'down';
    }
  }

  private async checkRedis(): Promise<ComponentStatus> {
    try {
      const pong = await this.redis.client.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch (error) {
      this.logger.warn(`Redis readiness check failed: ${(error as Error).message}`);
      return 'down';
    }
  }
}
