import { Global, Module } from '@nestjs/common';
import { FinanceLedgerService } from './finance-ledger.service.js';

@Global()
@Module({
  providers: [FinanceLedgerService],
  exports: [FinanceLedgerService],
})
export class FinanceLedgerModule {}
