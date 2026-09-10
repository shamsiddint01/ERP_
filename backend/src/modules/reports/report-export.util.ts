/** UTF-8 byte-order mark — makes Excel open the file as UTF-8 instead of the local ANSI codepage. */
const BOM = '﻿';

export interface CsvColumn {
  /** Property on each row object. */
  key: string;
  /** Human-friendly column heading; defaults to `key`. */
  header?: string;
  /** Optional value formatter (e.g. dates -> ISO, Decimals -> fixed 2dp). */
  format?: (value: unknown, row: Record<string, unknown>) => unknown;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Generic array-of-objects -> CSV serializer shared by every report export
 * endpoint. Emits a UTF-8 BOM and CRLF line endings so the file opens cleanly
 * in Excel; `columns` gives friendly headers and per-cell formatting, and when
 * omitted the row object's own keys are used (backwards-compatible).
 */
export function toCsv(rows: Record<string, unknown>[], columns?: CsvColumn[]): string {
  const cols: CsvColumn[] = columns ?? (rows[0] ? Object.keys(rows[0]).map((key) => ({ key })) : []);
  if (cols.length === 0) return BOM;

  const headerLine = cols.map((c) => escapeCell(c.header ?? c.key)).join(',');
  const bodyLines = rows.map((row) =>
    cols.map((c) => escapeCell(c.format ? c.format(row[c.key], row) : row[c.key])).join(','),
  );
  return BOM + [headerLine, ...bodyLines].join('\r\n');
}
