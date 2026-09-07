import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { InvoicesService } from './invoices.service.js';

function createFakeInvoice(overrides: Partial<{ status: string; amountPaid: string; grandTotal: string }> = {}) {
  return {
    id: 'inv1',
    invoiceNumber: 'INV-2026-000001',
    status: overrides.status ?? 'SENT',
    grandTotal: overrides.grandTotal ?? '1000',
    amountPaid: overrides.amountPaid ?? '0',
    dueDate: new Date(Date.now() + 86_400_000),
  };
}

function createTx(invoice: ReturnType<typeof createFakeInvoice>) {
  return {
    invoice: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(invoice),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...invoice, ...data })),
    },
  };
}

function createService() {
  const registry = new AuditEntityRegistryService();
  const prisma = { invoice: { findUnique: vi.fn() } };
  const pdfService = { generate: vi.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new InvoicesService(prisma as any, pdfService as any, registry);
}

describe('InvoicesService.applyPayment', () => {
  it('rejects a payment against a DRAFT invoice', async () => {
    const invoice = createFakeInvoice({ status: 'DRAFT' });
    const tx = createTx(invoice);
    const service = createService();

    await expect(service.applyPayment('inv1', 100, tx as never)).rejects.toThrow(BadRequestException);
  });

  it('rejects a payment exceeding the remaining balance', async () => {
    const invoice = createFakeInvoice({ grandTotal: '1000', amountPaid: '600' });
    const tx = createTx(invoice);
    const service = createService();

    await expect(service.applyPayment('inv1', 500, tx as never)).rejects.toThrow(BadRequestException);
  });

  it('moves to PARTIALLY_PAID when some balance remains', async () => {
    const invoice = createFakeInvoice({ grandTotal: '1000', amountPaid: '0' });
    const tx = createTx(invoice);
    const service = createService();

    const result = await service.applyPayment('inv1', 400, tx as never);
    expect(result).toMatchObject({ amountPaid: 400, status: 'PARTIALLY_PAID' });
  });

  it('moves to PAID once the full amount is covered', async () => {
    const invoice = createFakeInvoice({ grandTotal: '1000', amountPaid: '400' });
    const tx = createTx(invoice);
    const service = createService();

    const result = await service.applyPayment('inv1', 600, tx as never);
    expect(result).toMatchObject({ amountPaid: 1000, status: 'PAID' });
  });
});

describe('InvoicesService.reversePayment', () => {
  it('reverts a fully-paid invoice back to SENT once the payment is refunded', async () => {
    const invoice = createFakeInvoice({ status: 'PAID', grandTotal: '1000', amountPaid: '1000' });
    const tx = createTx(invoice);
    const service = createService();

    const result = await service.reversePayment('inv1', 1000, tx as never);
    expect(result).toMatchObject({ amountPaid: 0, status: 'SENT' });
  });
});

describe('InvoicesService.void', () => {
  it('refuses to void an invoice that already has payments', async () => {
    const service = createService();
    vi.spyOn(service, 'findOne').mockResolvedValue(createFakeInvoice({ amountPaid: '400' }) as never);

    await expect(service.void('inv1')).rejects.toThrow(ConflictException);
  });
});
