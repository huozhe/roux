import { and, desc, eq, inArray } from "drizzle-orm";
import { captionSkips, getDb } from "@/lib/db";

/** Persist permanent-ish sync skips (not full error text). */
export const CAPTION_SKIP_KINDS = [
  "no_captions",
  "auth_blocked",
  "unavailable",
] as const;
export type CaptionSkipKind = (typeof CAPTION_SKIP_KINDS)[number];

/** Higher = more definitive; never demote to a lower rank on upsert. */
const KIND_RANK: Record<CaptionSkipKind, number> = {
  unavailable: 3,
  no_captions: 2,
  auth_blocked: 1,
};

export function isCaptionSkipKind(k: string): k is CaptionSkipKind {
  return (CAPTION_SKIP_KINDS as readonly string[]).includes(k);
}

export type CaptionSkipRow = {
  videoId: string;
  title: string;
  kind: CaptionSkipKind;
  playlistId: string | null;
  updatedAt: string;
};

export async function listCaptionSkipVideoIds(
  userId: string,
): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ videoId: captionSkips.videoId })
    .from(captionSkips)
    .where(
      and(
        eq(captionSkips.userId, userId),
        inArray(captionSkips.kind, [...CAPTION_SKIP_KINDS]),
      ),
    );
  return new Set(rows.map((r) => r.videoId));
}

export async function listCaptionSkips(
  userId: string,
): Promise<CaptionSkipRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      videoId: captionSkips.videoId,
      title: captionSkips.title,
      kind: captionSkips.kind,
      playlistId: captionSkips.playlistId,
      updatedAt: captionSkips.updatedAt,
    })
    .from(captionSkips)
    .where(eq(captionSkips.userId, userId))
    .orderBy(desc(captionSkips.updatedAt));

  return rows
    .filter((r) => isCaptionSkipKind(r.kind))
    .map((r) => ({
      videoId: r.videoId,
      title: r.title,
      kind: r.kind as CaptionSkipKind,
      playlistId: r.playlistId,
      updatedAt: r.updatedAt.toISOString(),
    }));
}

/**
 * Upsert skip status only (no failure message blob).
 * Does not demote kind (e.g. no_captions stays if a flaky re-fetch says auth_blocked).
 */
export async function upsertCaptionSkip(
  userId: string,
  row: {
    videoId: string;
    title: string;
    kind: CaptionSkipKind;
    playlistId?: string | null;
  },
): Promise<void> {
  if (!isCaptionSkipKind(row.kind)) return;
  const db = getDb();
  const now = new Date();
  const title = row.title || row.videoId;

  const existing = await db
    .select({ kind: captionSkips.kind })
    .from(captionSkips)
    .where(
      and(
        eq(captionSkips.userId, userId),
        eq(captionSkips.videoId, row.videoId),
      ),
    )
    .limit(1);

  let kind = row.kind;
  const prev = existing[0]?.kind;
  if (prev && isCaptionSkipKind(prev) && KIND_RANK[prev] > KIND_RANK[kind]) {
    kind = prev;
  }

  await db
    .insert(captionSkips)
    .values({
      userId,
      videoId: row.videoId,
      title,
      kind,
      reason: null,
      playlistId: row.playlistId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [captionSkips.userId, captionSkips.videoId],
      set: {
        title,
        kind,
        reason: null,
        playlistId: row.playlistId ?? null,
        updatedAt: now,
      },
    });
}
