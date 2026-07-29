/**
 * Pure sync decision helpers (unit-tested, no I/O).
 */

/** Skip extract/insert when tombstoned or soft-archived. */
export function shouldSkipVideo(opts: {
  tombstoned: boolean;
  archived: boolean;
}): boolean {
  return opts.tombstoned || opts.archived;
}

/** Never re-extract over a user-verified recipe. */
export function shouldSkipReextract(existing: {
  verified: boolean;
} | null): boolean {
  return existing?.verified === true;
}

/**
 * Early-stop playlist pagination: after first full crawl, stop when a page
 * is entirely known (already in library or otherwise tracked).
 */
export function shouldEarlyStopPage(
  pageVideoIds: string[],
  knownVideoIds: ReadonlySet<string>,
  isFirstCrawl: boolean,
): boolean {
  if (isFirstCrawl) return false;
  if (pageVideoIds.length === 0) return true;
  return pageVideoIds.every((id) => knownVideoIds.has(id));
}

/** Prefer updating only when row exists and is not verified. */
export function canWriteExtract(
  existing: { verified: boolean; archivedAt: Date | null } | null,
): "insert" | "update" | "skip" {
  if (!existing) return "insert";
  if (existing.archivedAt) return "skip";
  if (existing.verified) return "skip";
  return "update";
}
