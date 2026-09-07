import { Global, Module } from '@nestjs/common';
import { AuditEntityRegistryService } from './audit-entity-registry.service.js';

@Global()
@Module({
  providers: [AuditEntityRegistryService],
  exports: [AuditEntityRegistryService],
})
export class AuditRegistryModule {}
