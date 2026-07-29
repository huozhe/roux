import { and, desc, eq, inArray } from "drizzle-orm";
import { captionSkips, getDb, syncRuns } from "@/lib/db";

export const CAPTION_SKIP_KINDS = ["no_captions", "auth_blocked"] as const;
export type CaptionSkipKind = (typeof CAPTION_SKIP_KINDS)[number];

export function isCaptionSkipKind(k: string): k is CaptionSkipKind {
  return (CAPTION_SKIP_KINDS as readonly string[]).includes(k);
}

export type CaptionSkipRow = {
  videoId: string;
  title: string;
  kind: CaptionSkipKind;
  reason: string | null;
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
      reason: captionSkips.reason,
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
      reason: r.reason,
      playlistId: r.playlistId,
      updatedAt: r.updatedAt.toISOString(),
    }));
}

export async function upsertCaptionSkip(
  userId: string,
  row: {
    videoId: string;
    title: string;
    kind: CaptionSkipKind;
    reason?: string | null;
    playlistId?: string | null;
  },
): Promise<void> {
  if (!isCaptionSkipKind(row.kind)) return;
  const db = getDb();
  const now = new Date();
  await db
    .insert(captionSkips)
    .values({
      userId,
      videoId: row.videoId,
      title: row.title || row.videoId,
      kind: row.kind,
      reason: row.reason ?? null,
      playlistId: row.playlistId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [captionSkips.userId, captionSkips.videoId],
      set: {
        title: row.title || row.videoId,
        kind: row.kind,
        reason: row.reason ?? null,
        playlistId: row.playlistId ?? null,
        updatedAt: now,
      },
    });
}

/**
 * Backfill from the most recent sync_run.detail.needTranscript
 * (covers failures before caption_skips existed).
 */
export async function backfillCaptionSkipsFromLastRun(
  userId: string,
): Promise<number> {
  const db = getDb();
  const runs = await db
    .select({ detail: syncRuns.detail })
    .from(syncRuns)
    .where(eq(syncRuns.userId, userId))
    .orderBy(desc(syncRuns.startedAt))
    .limit(5);

  let n = 0;
  for (const run of runs) {
    const detail = run.detail as {
      needTranscript?: Array<{
        videoId?: string;
        title?: string;
        reason?: string;
        kind?: string;
        playlistId?: string;
      }>;
    } | null;
    const items = detail?.needTranscript ?? [];
    for (const item of items) {
      if (!item.videoId) continue;
      const reason = item.reason ?? "";
      let kind: CaptionSkipKind | null = null;
      // Prefer explicit kind when new code already classified correctly.
      if (item.kind === "no_captions" || item.kind === "auth_blocked") {
        kind = item.kind;
      }
      // Legacy: empty tracks were logged with "LOGIN_REQUIRED or captions off"
      // even when the video was playable — treat as no_captions.
      if (
        /no caption tracks|LOGIN_REQUIRED or captions off|no captions \(uploader|No captions on this video/i.test(
          reason,
        )
      ) {
        kind = "no_captions";
      } else if (
        !kind &&
        (/auth blocked/i.test(reason) ||
          (/\bLOGIN_REQUIRED\b/.test(reason) &&
            !/or captions off/i.test(reason)))
      ) {
        kind = "auth_blocked";
      }
      if (!kind) continue;
      await upsertCaptionSkip(userId, {
        videoId: item.videoId,
        title: item.title ?? item.videoId,
        kind,
        reason: item.reason ?? null,
        playlistId: item.playlistId ?? null,
      });
      n += 1;
    }
  }
  return n;
}
