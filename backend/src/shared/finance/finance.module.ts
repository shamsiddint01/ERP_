import { Global, Module } from '@nestjs/common';
import { FinanceLedgerService } from './finance-ledger.service.js';
import { JournalService } from './journal.service.js';

@Global()
@Module({
  providers: [JournalService, FinanceLedgerService],
  exports: [JournalService, FinanceLedgerService],
})
export class FinanceLedgerModule {}
