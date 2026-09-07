import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Prisma } from '@prisma/client';
import type { Observable } from 'rxjs';
import { concatMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AUDITED_KEY, type AuditedOptions } from '../decorators/audited.decorator.js';
import { AuditEntityRegistryService } from '../audit/audit-entity-registry.service.js';
import { diffFields, sanitizeEntity } from '../audit/diff-fields.util.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';

const METHOD_TO_ACTION: Record<string, string> = {
  POST: 'CREATE',
  PATCH: 'UPDATE',
  PUT: 'UPDATE',
  DELETE: 'DELETE',
};

/**
 * Writes an AuditLog row for every route marked with @Audited(), without each
 * service having to call the audit log manually. Captures a "before" snapshot
 * via AuditEntityRegistryService (for UPDATE/DELETE), diffs it against the
 * handler's response, and persists only the fields that actually changed.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly registry: AuditEntityRegistryService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<AuditedOptions | undefined>(AUDITED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return next.handle();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const action = options.action ?? METHOD_TO_ACTION[request.method] ?? request.method;
    const routeEntityId = request.params?.id as string | undefined;

    const beforeSnapshot =
      routeEntityId && action !== 'CREATE' ? this.registry.findById(options.entityType, routeEntityId) : Promise.resolve(null);

    return next.handle().pipe(
      concatMap(async (response) => {
        const oldValue = sanitizeEntity(await beforeSnapshot);
        const newResponse = response && typeof response === 'object' ? (response as Record<string, unknown>) : null;
        const newValue = action === 'DELETE' ? null : sanitizeEntity(newResponse);
        const entityId = routeEntityId ?? (newResponse?.id as string | undefined) ?? 'unknown';
        // For CREATE there is no "before" state to diff against — record the
        // full new snapshot rather than every field showing as "changed from null".
        const diff = action === 'CREATE' ? { old: {}, new: newValue ?? {} } : diffFields(oldValue, newValue);

        await this.prisma.auditLog.create({
          data: {
            actorUserId: request.user?.id ?? null,
            action,
            entityType: options.entityType,
            entityId,
            oldValue: Object.keys(diff.old).length > 0 ? (diff.old as Prisma.InputJsonValue) : undefined,
            newValue: Object.keys(diff.new).length > 0 ? (diff.new as Prisma.InputJsonValue) : undefined,
            description: `${request.user?.username ?? 'system'} ${action.toLowerCase()}d ${options.entityType} ${entityId}`,
            ipAddress: request.ip,
          },
        });

        return response;
      }),
    );
  }
}
