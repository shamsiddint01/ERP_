const AVATAR_PALETTE = ['#EF5B34', '#D9891A', '#3A9E6F', '#4C82D6', '#9466E0', '#C9547E'];

/** Deterministic, pleasant avatar background derived from a name — the same person always gets the same color. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
