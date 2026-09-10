import { describe, expect, it } from 'vitest';
import { toCsv } from './report-export.util.js';

describe('toCsv', () => {
  it('prefixes a UTF-8 BOM and uses CRLF line endings so Excel opens it cleanly', () => {
    const csv = toCsv([{ a: 1, b: 'x' }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('\r\n');
    expect(csv).toBe('﻿a,b\r\n1,x');
  });

  it('falls back to the row keys as headers when no column spec is given (backwards compatible)', () => {
    const csv = toCsv([{ code: '1000', name: 'Cash' }]).replace('﻿', '');
    expect(csv.split('\r\n')[0]).toBe('code,name');
  });

  it('honours a column spec: friendly headers, ordering, and per-cell formatting', () => {
    const csv = toCsv(
      [{ amount: 1234.5, when: new Date('2026-09-10T00:00:00.000Z') }],
      [
        { key: 'when', header: 'Date', format: (v) => (v as Date).toISOString().slice(0, 10) },
        { key: 'amount', header: 'Amount', format: (v) => Number(v).toFixed(2) },
      ],
    ).replace('﻿', '');
    expect(csv).toBe('Date,Amount\r\n2026-09-10,1234.50');
  });

  it('escapes quotes, commas and newlines', () => {
    const csv = toCsv([{ note: 'a,b "c"\nd' }]).replace('﻿', '');
    expect(csv).toBe('note\r\n"a,b ""c""\nd"');
  });

  it('returns just the BOM for an empty result set', () => {
    expect(toCsv([])).toBe('﻿');
  });
});
