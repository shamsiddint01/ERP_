import { Injectable } from '@nestjs/common';

type EntityLookup = (id: string) => Promise<Record<string, unknown> | null>;

/**
 * Lets each module register how to fetch a "before" snapshot of its entity
 * by id, so AuditInterceptor can diff old/new values without every service
 * having to call the audit log manually. Populated in each module's
 * constructor (see UsersService, RolesService, ...).
 */
@Injectable()
export class AuditEntityRegistryService {
  private readonly lookups = new Map<string, EntityLookup>();

  register(entityType: string, lookup: EntityLookup): void {
    this.lookups.set(entityType, lookup);
  }

  async findById(entityType: string, id: string): Promise<Record<string, unknown> | null> {
    const lookup = this.lookups.get(entityType);
    if (!lookup) return null;
    return lookup(id);
  }
}
