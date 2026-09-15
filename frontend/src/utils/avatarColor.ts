const AVATAR_PALETTE = ['#4F46E5', '#0284C7', '#059669', '#D97706', '#DB2777', '#7C3AED'];

/** Deterministic, pleasant avatar background derived from a name — the same person always gets the same color. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
