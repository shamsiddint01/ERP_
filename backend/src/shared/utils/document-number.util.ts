/** Generates human-readable sequential document numbers like "PO-2026-000123". */
export async function generateDocumentNumber(prefix: string, countFn: () => Promise<number>): Promise<string> {
  const year = new Date().getFullYear();
  const count = await countFn();
  return `${prefix}-${year}-${String(count + 1).padStart(6, '0')}`;
}
