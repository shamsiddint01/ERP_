import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../shared/decorators/public.decorator.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness — the process is up and the event loop is responsive. Always 200. */
  @Public()
  @Get()
  @HttpCode(200)
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /** Readiness — safe to route traffic here (database reachable). 503 when not. */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const result = await this.healthService.readiness();
    res.status(result.status === 'error' ? 503 : 200);
    return { ...result, timestamp: new Date().toISOString() };
  }
}
