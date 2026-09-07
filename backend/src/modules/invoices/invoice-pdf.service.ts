import { Injectable } from '@nestjs/common';
import type { Invoice, InvoiceItem, Customer, CompanySettings } from '@prisma/client';
import PDFDocument from 'pdfkit';

type InvoiceForPdf = Invoice & {
  customer: Customer;
  items: (InvoiceItem & { product: { name: string } | null })[];
};

const PAGE_MARGIN = 50;

@Injectable()
export class InvoicePdfService {
  generate(invoice: InvoiceForPdf, settings: CompanySettings | null): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const currency = settings?.currency ?? 'UZS';
      const money = (value: unknown) => `${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currency}`;

      // --- Header: company on the left, invoice title on the right ---
      doc.fontSize(18).font('Helvetica-Bold').text(settings?.companyName ?? 'Company', PAGE_MARGIN, PAGE_MARGIN);
      doc.fontSize(9).font('Helvetica').fillColor('#555555');
      if (settings?.logoUrl) doc.text(`Logo: ${settings.logoUrl}`);

      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text('INVOICE', PAGE_MARGIN, PAGE_MARGIN, { align: 'right' });
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#333333')
        .text(invoice.invoiceNumber, { align: 'right' })
        .text(`Issue date: ${invoice.issueDate.toISOString().slice(0, 10)}`, { align: 'right' })
        .text(`Due date: ${invoice.dueDate.toISOString().slice(0, 10)}`, { align: 'right' })
        .text(`Status: ${invoice.status}`, { align: 'right' });

      doc.moveDown(2);
      doc
        .moveTo(PAGE_MARGIN, doc.y)
        .lineTo(doc.page.width - PAGE_MARGIN, doc.y)
        .strokeColor('#dddddd')
        .stroke();
      doc.moveDown(1);

      // --- Bill to ---
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('Bill to');
      doc.font('Helvetica').fontSize(10).fillColor('#333333');
      doc.text(invoice.customer.companyName ?? invoice.customer.name);
      if (invoice.customer.companyName) doc.text(invoice.customer.name);
      doc.text(invoice.customer.phone);
      if (invoice.customer.email) doc.text(invoice.customer.email);
      if (invoice.customer.address) doc.text(invoice.customer.address);
      doc.moveDown(1.5);

      // --- Items table ---
      const columns = [
        { key: 'description', label: 'Description', width: 210 },
        { key: 'quantity', label: 'Qty', width: 50, align: 'right' as const },
        { key: 'unitPrice', label: 'Unit price', width: 90, align: 'right' as const },
        { key: 'taxPercent', label: 'Tax %', width: 50, align: 'right' as const },
        { key: 'discountAmount', label: 'Discount', width: 70, align: 'right' as const },
        { key: 'lineTotal', label: 'Total', width: 85, align: 'right' as const },
      ];
      let x = PAGE_MARGIN;
      const tableTop = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
      doc.rect(PAGE_MARGIN, tableTop, doc.page.width - PAGE_MARGIN * 2, 20).fill('#333333');
      x = PAGE_MARGIN;
      for (const col of columns) {
        doc.fillColor('#ffffff').text(col.label, x + 4, tableTop + 6, { width: col.width - 8, align: col.align ?? 'left' });
        x += col.width;
      }

      let rowY = tableTop + 20;
      doc.font('Helvetica').fontSize(9).fillColor('#000000');
      invoice.items.forEach((item, index) => {
        if (index % 2 === 1) {
          doc.rect(PAGE_MARGIN, rowY, doc.page.width - PAGE_MARGIN * 2, 20).fill('#f5f5f5');
          doc.fillColor('#000000');
        }
        x = PAGE_MARGIN;
        const values: Record<string, string> = {
          description: item.product?.name ?? item.description,
          quantity: Number(item.quantity).toString(),
          unitPrice: money(item.unitPrice),
          taxPercent: `${Number(item.taxPercent)}%`,
          discountAmount: money(item.discountAmount),
          lineTotal: money(item.lineTotal),
        };
        for (const col of columns) {
          doc.text(values[col.key], x + 4, rowY + 6, { width: col.width - 8, align: col.align ?? 'left' });
          x += col.width;
        }
        rowY += 20;
      });

      doc.moveTo(PAGE_MARGIN, rowY).lineTo(doc.page.width - PAGE_MARGIN, rowY).strokeColor('#dddddd').stroke();
      doc.y = rowY + 12;

      // --- Totals ---
      const totalsX = doc.page.width - PAGE_MARGIN - 220;
      const totalLine = (label: string, value: string, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10);
        doc.text(label, totalsX, doc.y, { width: 130, align: 'left', continued: true });
        doc.text(value, { width: 90, align: 'right' });
      };
      totalLine('Subtotal', money(invoice.subtotal));
      totalLine('Tax', money(invoice.taxTotal));
      totalLine('Discount', `- ${money(invoice.discountTotal)}`);
      doc.moveDown(0.3);
      totalLine('Total', money(invoice.grandTotal), true);
      totalLine('Paid', money(invoice.amountPaid));
      totalLine('Remaining', money(Number(invoice.grandTotal) - Number(invoice.amountPaid)), true);

      doc.end();
    });
  }
}
