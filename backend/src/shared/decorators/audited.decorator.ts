import { SetMetadata } from '@nestjs/common';

export const AUDITED_KEY = 'audited';

export interface AuditedOptions {
  entityType: string;
  /** Defaults to a verb derived from the HTTP method (CREATE/UPDATE/DELETE) when omitted. */
  action?: string;
}

/** Marks a route as a mutation that must be recorded in the Audit Log, handled by AuditInterceptor. */
export const Audited = (entityType: string, action?: string) => SetMetadata(AUDITED_KEY, { entityType, action } satisfies AuditedOptions);
