import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

const PAGE_MARGIN = 50;

export interface ReportPdfColumn {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'right';
}

/** Generic tabular report renderer (Trial Balance, P&L, ...) reusing the same layout as InvoicePdfService. */
@Injectable()
export class ReportPdfService {
  generateTabular(
    title: string,
    subtitle: string,
    columns: ReportPdfColumn[],
    rows: Record<string, string>[],
    totals: { label: string; value: string }[] = [],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000').text(title, PAGE_MARGIN, PAGE_MARGIN);
      doc.fontSize(10).font('Helvetica').fillColor('#555555').text(subtitle);
      doc.moveDown(1);

      const tableWidth = doc.page.width - PAGE_MARGIN * 2;
      let rowY = doc.y;
      const drawHeader = () => {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
        doc.rect(PAGE_MARGIN, rowY, tableWidth, 20).fill('#333333');
        let x = PAGE_MARGIN;
        for (const col of columns) {
          doc.fillColor('#ffffff').text(col.label, x + 4, rowY + 6, { width: col.width - 8, align: col.align ?? 'left' });
          x += col.width;
        }
        rowY += 20;
      };
      drawHeader();

      doc.font('Helvetica').fontSize(9).fillColor('#000000');
      rows.forEach((row, index) => {
        if (rowY > doc.page.height - 120) {
          doc.addPage();
          rowY = PAGE_MARGIN;
          drawHeader();
          doc.font('Helvetica').fontSize(9).fillColor('#000000');
        }
        if (index % 2 === 1) {
          doc.rect(PAGE_MARGIN, rowY, tableWidth, 20).fill('#f5f5f5');
          doc.fillColor('#000000');
        }
        let x = PAGE_MARGIN;
        for (const col of columns) {
          doc.text(row[col.key] ?? '', x + 4, rowY + 6, { width: col.width - 8, align: col.align ?? 'left' });
          x += col.width;
        }
        rowY += 20;
      });

      doc
        .moveTo(PAGE_MARGIN, rowY)
        .lineTo(doc.page.width - PAGE_MARGIN, rowY)
        .strokeColor('#dddddd')
        .stroke();
      doc.y = rowY + 12;

      const totalsX = doc.page.width - PAGE_MARGIN - 220;
      for (const total of totals) {
        doc.font('Helvetica-Bold').fontSize(11);
        doc.text(total.label, totalsX, doc.y, { width: 130, align: 'left', continued: true });
        doc.text(total.value, { width: 90, align: 'right' });
      }

      doc.end();
    });
  }
}
