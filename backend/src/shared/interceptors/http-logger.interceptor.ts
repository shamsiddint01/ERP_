import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';

const SKIP_PATHS = new Set(['/api/v1/health', '/api/v1/health/ready']);

/**
 * One compact line per request: method, path, status, duration, and the
 * authenticated user id when present. Deliberately never touches headers,
 * cookies or the request/response body, so tokens, passwords and secrets
 * cannot end up in the logs. Health-probe paths are skipped to keep the log
 * readable under a k8s/load-balancer probe.
 */
@Injectable()
export class HttpLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: { id?: string } }>();
    if (SKIP_PATHS.has(req.originalUrl.split('?')[0])) return next.handle();

    const start = Date.now();
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap({
        next: () => this.write(req, res.statusCode, Date.now() - start),
        error: (err: { status?: number }) => this.write(req, err?.status ?? 500, Date.now() - start),
      }),
    );
  }

  private write(req: Request & { user?: { id?: string } }, status: number, ms: number): void {
    const actor = req.user?.id ? ` user=${req.user.id}` : '';
    this.logger.log(`${req.method} ${req.originalUrl.split('?')[0]} ${status} ${ms}ms${actor}`);
  }
}
