import { Injectable } from '@nestjs/common';
import type { Prisma, Transaction, TransactionReferenceType, TransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { generateDocumentNumber } from '../utils/document-number.util.js';

type TransactionClient = Prisma.TransactionClient;

const DEFAULT_ACCOUNT_NAME = 'Asosiy hisob';

/**
 * A minimal ledger writer shared by Orders (SALE_REVENUE) and Payments
 * (PAYMENT_IN/REFUND) so a real Transaction row always backs a financial
 * event, without needing the full multi-account chart-of-accounts UI that
 * belongs to the Finance module (a later phase). Everything posts against
 * one auto-provisioned "Asosiy hisob" account for now — see Gap Analysis:
 * proper double-entry bookkeeping is intentionally deferred to Finance.
 */
@Injectable()
export class FinanceLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async recordTransaction(
    params: {
      type: TransactionType;
      amount: number;
      referenceType: TransactionReferenceType;
      referenceId: string;
      description: string;
      createdByUserId: string;
      transactionDate?: Date;
    },
    tx?: TransactionClient,
  ): Promise<Transaction> {
    if (!tx) {
      return this.prisma.$transaction((trx) => this.recordTransaction(params, trx));
    }

    const account = await this.getOrCreateDefaultAccount(tx);
    const transactionNumber = await generateDocumentNumber('TXN', () => tx.transaction.count());

    await tx.account.update({ where: { id: account.id }, data: { currentBalance: { increment: params.amount } } });

    return tx.transaction.create({
      data: {
        transactionNumber,
        type: params.type,
        accountId: account.id,
        amount: params.amount,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        description: params.description,
        transactionDate: params.transactionDate ?? new Date(),
        createdByUserId: params.createdByUserId,
      },
    });
  }

  private async getOrCreateDefaultAccount(tx: TransactionClient) {
    const existing = await tx.account.findFirst({ where: { name: DEFAULT_ACCOUNT_NAME } });
    if (existing) return existing;
    return tx.account.create({ data: { name: DEFAULT_ACCOUNT_NAME, type: 'CASH' } });
  }
}
