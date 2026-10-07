/** A cancelled group is purged this many days after it was cancelled (GroupsCleanupScheduler on the backend). */
export const CANCELLED_GROUP_RETENTION_DAYS = 10;

/** Whole days left before a cancelled group is purged (0 = within the next day); null when not counting down. */
export function purgeDaysLeft(group: { status: string; cancelledAt?: string | null }, now = Date.now()): number | null {
  if (group.status !== 'CANCELLED' || !group.cancelledAt) return null;
  const purgeAt = new Date(group.cancelledAt).getTime() + CANCELLED_GROUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(Math.ceil((purgeAt - now) / (24 * 60 * 60 * 1000)), 0);
}

export function purgeLabel(daysLeft: number): string {
  return daysLeft <= 0 ? "Bugun o'chadi" : `${daysLeft} kundan keyin o'chadi`;
}
