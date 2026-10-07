const SENSITIVE_FIELDS = new Set(['passwordHash', 'refreshTokenHash', 'temporaryPassword']);

export interface FieldDiff {
  old: Record<string, unknown>;
  new: Record<string, unknown>;
}

function isPlainScalar(value: unknown): boolean {
  return value === null || value === undefined || typeof value !== 'object' || value instanceof Date;
}

/**
 * Reduces two snapshots of the same entity to only the fields that actually
 * changed. Relation-shaped fields (e.g. a joined `role` object) are skipped
 * entirely rather than compared: the "before" snapshot is a raw table row
 * while the "after" snapshot is often a service response enriched with
 * joins, so those two shapes are never reliably comparable field-by-field.
 */
export function diffFields(oldObj: Record<string, unknown> | null, newObj: Record<string, unknown> | null): FieldDiff {
  const oldDiff: Record<string, unknown> = {};
  const newDiff: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(oldObj ?? {}), ...Object.keys(newObj ?? {})]);

  for (const key of keys) {
    if (SENSITIVE_FIELDS.has(key)) continue;
    const oldVal = oldObj?.[key];
    const newVal = newObj?.[key];
    if (!isPlainScalar(oldVal) || !isPlainScalar(newVal)) continue;
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      oldDiff[key] = oldVal ?? null;
      newDiff[key] = newVal ?? null;
    }
  }

  return { old: oldDiff, new: newDiff };
}

export function sanitizeEntity(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!obj) return null;
  const clone = { ...obj };
  for (const field of SENSITIVE_FIELDS) delete clone[field];
  return clone;
}
