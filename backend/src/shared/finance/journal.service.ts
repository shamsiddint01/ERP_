import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Account, JournalEntry, JournalLine, Prisma, TransactionReferenceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { generateDocumentNumber } from '../utils/document-number.util.js';

type TransactionClient = Prisma.TransactionClient;

export interface JournalLineInput {
  accountId: string;
  debit?: number;
  credit?: number;
  description?: string;
}

export interface PostJournalEntryParams {
  entryDate?: Date;
  description: string;
  referenceType?: TransactionReferenceType;
  referenceId?: string;
  createdByUserId: string;
  lines: JournalLineInput[];
}

export type JournalEntryWithLines = JournalEntry & { lines: JournalLine[] };

const DEBIT_NORMAL_CATEGORIES = new Set(['ASSET', 'EXPENSE']);

/** Rounds to cents so float drift from repeated division/multiplication never fails the balance check. */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * The single choke point for every double-entry posting in the system.
 * Every caller (FinanceLedgerService's semantic methods) builds a set of
 * debit/credit lines and hands them here — this is the only place that
 * creates a JournalEntry, and it refuses anything that doesn't balance,
 * targets a non-postable/header account, or targets an inactive account.
 */
@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  async postEntry(params: PostJournalEntryParams, tx?: TransactionClient): Promise<JournalEntryWithLines> {
    if (!tx) {
      return this.prisma.$transaction((trx) => this.postEntry(params, trx));
    }

    if (params.lines.length < 2) {
      throw new BadRequestException('A journal entry needs at least two lines');
    }

    let totalDebitCents = 0;
    let totalCreditCents = 0;
    for (const line of params.lines) {
      const debit = line.debit ?? 0;
      const credit = line.credit ?? 0;
      if (debit < 0 || credit < 0) throw new BadRequestException('Debit/credit amounts cannot be negative');
      if (debit > 0 && credit > 0) throw new BadRequestException('A single journal line cannot have both a debit and a credit');
      if (debit === 0 && credit === 0) throw new BadRequestException('Each journal line needs a nonzero debit or credit');
      totalDebitCents += toCents(debit);
      totalCreditCents += toCents(credit);
    }
    if (totalDebitCents !== totalCreditCents) {
      throw new ConflictException(
        `Journal entry is not balanced: total debit ${totalDebitCents / 100} does not equal total credit ${totalCreditCents / 100}`,
      );
    }

    const accountIds = [...new Set(params.lines.map((line) => line.accountId))];
    const accounts = await tx.account.findMany({ where: { id: { in: accountIds } } });
    const accountById = new Map<string, Account>(accounts.map((account) => [account.id, account]));
    for (const id of accountIds) {
      const account = accountById.get(id);
      if (!account) throw new NotFoundException(`Account ${id} not found`);
      if (!account.isPostable) throw new BadRequestException(`"${account.name}" is a header account and cannot be posted to directly`);
      if (!account.isActive) throw new BadRequestException(`Account "${account.name}" is inactive`);
    }

    const entryNumber = await generateDocumentNumber('JE', () => tx.journalEntry.count());
    const entry = await tx.journalEntry.create({
      data: {
        entryNumber,
        entryDate: params.entryDate ?? new Date(),
        description: params.description,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        createdByUserId: params.createdByUserId,
        lines: {
          create: params.lines.map((line) => ({
            accountId: line.accountId,
            debit: line.debit ?? 0,
            credit: line.credit ?? 0,
            description: line.description,
          })),
        },
      },
      include: { lines: true },
    });

    for (const line of params.lines) {
      const account = accountById.get(line.accountId)!;
      const isDebitNormal = DEBIT_NORMAL_CATEGORIES.has(account.category);
      const delta = isDebitNormal ? (line.debit ?? 0) - (line.credit ?? 0) : (line.credit ?? 0) - (line.debit ?? 0);
      await tx.account.update({ where: { id: account.id }, data: { currentBalance: { increment: delta } } });
    }

    return entry;
  }
}
