/**
 * Sync pipeline: selected playlists → transcripts → Claude extract → recipes.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { extractRecipe } from "@/lib/extract";
import {
  getDb,
  playlists,
  recipeTombstones,
  recipes,
  syncRuns,
} from "@/lib/db";
import { learnCategoriesFromLabels } from "@/lib/recipes/queries";
import type { Confidence, Ingredient, Step } from "@/lib/types";
import {
  isCaptionSkipKind,
  listCaptionSkips,
  listCaptionSkipVideoIds,
  upsertCaptionSkip,
} from "@/lib/sync/caption-skips";
import { canWriteExtract, shouldSkipVideo } from "@/lib/sync/decisions";
import { getUserPrefs } from "@/lib/recipes/queries";
import {
  listPlaylistItems,
  type PlaylistItem,
} from "@/lib/youtube/playlist-items";
import { getAccessTokenForUser } from "@/lib/youtube/tokens";
import { fetchTranscriptDetailed } from "@/lib/youtube/transcript";
import { getVideosMeta } from "@/lib/youtube/videos";

export type SyncProgress = {
  stage: string;
  found?: number;
  written?: number;
  skipped?: number;
};

export type SyncResult = {
  found: number;
  written: number;
  skipped: number;
  result: string;
  detail: unknown;
};

export type SyncDetail = {
  needTranscript: Array<{
    videoId: string;
    title: string;
    playlistId: string;
    reason?: string;
    /** no_captions | auth_blocked | unavailable | empty_body | captcha | unknown */
    kind?: string;
  }>;
  errors: Array<{ videoId?: string; message: string }>;
  maxNewVideos: number;
  playlists: string[];
};

function defaultMaxNew(): number {
  const env = process.env.SYNC_MAX_NEW;
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 5;
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if ((err as { quota?: boolean }).quota) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /quota/i.test(msg);
}

function toSteps(
  extracted: { text: string; t_seconds: number }[],
): Step[] {
  return extracted.map((s, i) => ({
    n: i + 1,
    text: s.text,
    t_seconds: s.t_seconds,
  }));
}

function confidenceOf(c: string): Confidence {
  if (c === "high" || c === "medium" || c === "low") return c;
  return "medium";
}

/**
 * Run playlist sync + extract for one user.
 * Sequential processing; caps new extractions with maxNewVideos (default 5).
 */
export async function runSyncForUser(
  userId: string,
  opts?: {
    onProgress?: (p: SyncProgress) => void;
    maxNewVideos?: number;
  },
): Promise<SyncResult> {
  const db = getDb();
  const maxNew = opts?.maxNewVideos ?? defaultMaxNew();
  const onProgress = opts?.onProgress ?? (() => {});

  const detail: SyncDetail = {
    needTranscript: [],
    errors: [],
    maxNewVideos: maxNew,
    playlists: [],
  };

  let found = 0;
  let written = 0;
  let skipped = 0;
  let result = "ok";

  const [runRow] = await db
    .insert(syncRuns)
    .values({
      userId,
      found: 0,
      written: 0,
      skipped: 0,
      result: null,
      detail: null,
    })
    .returning({ id: syncRuns.id });

  const runId = runRow?.id;

  const finish = async (r: SyncResult) => {
    if (runId != null) {
      await db
        .update(syncRuns)
        .set({
          finishedAt: new Date(),
          found: r.found,
          written: r.written,
          skipped: r.skipped,
          result: r.result,
          detail: r.detail as object,
        })
        .where(eq(syncRuns.id, runId));
    }
    return r;
  };

  try {
    onProgress({ stage: "Reading playlist items…" });

    const selected = await db
      .select({
        id: playlists.id,
        title: playlists.title,
        lastSynced: playlists.lastSynced,
      })
      .from(playlists)
      .where(and(eq(playlists.userId, userId), eq(playlists.selected, true)));

    if (selected.length === 0) {
      return finish({
        found: 0,
        written: 0,
        skipped: 0,
        result: "no change",
        detail: { ...detail, message: "No playlists selected" },
      });
    }

    detail.playlists = selected.map((p) => p.id);

    const accessToken = await getAccessTokenForUser(userId);
    const userPrefs = await getUserPrefs(userId);
    const markVerified = userPrefs.syncMarkVerified === true;

    // Known recipes + tombstones for skip / re-extract decisions
    const existingRows = await db
      .select({
        id: recipes.id,
        videoId: recipes.videoId,
        verified: recipes.verified,
        archivedAt: recipes.archivedAt,
        videoStatus: recipes.videoStatus,
      })
      .from(recipes)
      .where(eq(recipes.userId, userId));

    const tombstoneRows = await db
      .select({ videoId: recipeTombstones.videoId })
      .from(recipeTombstones)
      .where(eq(recipeTombstones.userId, userId));

    const tombstoneSet = new Set(tombstoneRows.map((t) => t.videoId));
    const captionSkipSet = await listCaptionSkipVideoIds(userId);
    const existingByVideo = new Map(
      existingRows.map((r) => [r.videoId, r] as const),
    );

    // Always full-crawl playlistItems (1 unit/page). Early-stop is unsafe because
    // API order is playlist position, not newest-first — would miss new videos.
    // shouldEarlyStopPage remains for callers / tests; listPlaylistItems supports onPage.
    // Expensive path (transcript + Claude) is capped by maxNewVideos.
    const inPlaylist = new Set<string>();
    type Candidate = PlaylistItem & { playlistId: string };
    const candidates: Candidate[] = [];
    const seenCandidate = new Set<string>();

    for (const pl of selected) {
      onProgress({
        stage: `Reading playlist “${pl.title}”…`,
        found,
        written,
        skipped,
      });

      const items = await listPlaylistItems(accessToken, pl.id);

      for (const item of items) {
        inPlaylist.add(item.videoId);
        if (seenCandidate.has(item.videoId)) continue;
        seenCandidate.add(item.videoId);

        const existing = existingByVideo.get(item.videoId);
        const archived = Boolean(existing?.archivedAt);
        if (
          shouldSkipVideo({
            tombstoned: tombstoneSet.has(item.videoId),
            archived,
          })
        ) {
          continue;
        }

        // Known no_captions / auth_blocked — do not re-fetch every run
        if (captionSkipSet.has(item.videoId)) continue;

        // Already have a library row — only re-extract if unverified
        if (existing && canWriteExtract(existing) === "skip") continue;

        candidates.push({ ...item, playlistId: pl.id });
      }

      await db
        .update(playlists)
        .set({ lastSynced: new Date() })
        .where(and(eq(playlists.id, pl.id), eq(playlists.userId, userId)));
    }

    // Newest first
    candidates.sort(
      (a, b) =>
        new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
    );

    found = candidates.length;
    onProgress({
      stage:
        found === 0
          ? "No new videos to process"
          : `${found} video${found === 1 ? "" : "s"} to process`,
      found,
      written,
      skipped,
    });

    // Uploader channel (not playlist owner) via videos.list snippet
    const candidateMeta =
      candidates.length > 0
        ? await getVideosMeta(
            accessToken,
            candidates.map((c) => c.videoId),
          )
        : new Map();

    let processedNew = 0;

    for (const item of candidates) {
      if (processedNew >= maxNew) {
        skipped += 1;
        continue;
      }

      const existing = existingByVideo.get(item.videoId) ?? null;
      const writeMode = canWriteExtract(
        existing
          ? { verified: existing.verified, archivedAt: existing.archivedAt }
          : null,
      );
      if (writeMode === "skip") {
        skipped += 1;
        continue;
      }

      const meta = candidateMeta.get(item.videoId);
      const channelTitle =
        meta?.channelTitle?.trim() || item.channelTitle || "Unknown";
      const channelId = meta?.channelId || item.channelId || null;
      const videoTitle = meta?.title?.trim() || item.title;
      const thumbnailUrl = meta?.thumbnailUrl ?? item.thumbnailUrl;
      const publishedAtIso = meta?.publishedAt ?? item.publishedAt;

      onProgress({
        stage: `Fetching transcript for “${videoTitle}”…`,
        found,
        written,
        skipped,
      });

      // Do not pass OAuth accessToken to transcript fetch — innertube rejects
      // youtube.readonly Bearer tokens (403 insufficient scopes). Use optional
      // YOUTUBE_COOKIES env for cloud/Vercel LOGIN_REQUIRED instead.
      const transcript = await fetchTranscriptDetailed(item.videoId);
      if (!transcript.ok) {
        skipped += 1;
        const short = shortTranscriptReason(transcript.kind, transcript.reason);
        detail.needTranscript.push({
          videoId: item.videoId,
          title: videoTitle,
          playlistId: item.playlistId,
          reason: short,
          kind: transcript.kind,
        });
        if (isCaptionSkipKind(transcript.kind)) {
          await upsertCaptionSkip(userId, {
            videoId: item.videoId,
            title: videoTitle,
            kind: transcript.kind,
            playlistId: item.playlistId,
          }).catch(() => {
            /* non-fatal */
          });
          captionSkipSet.add(item.videoId);
        }
        onProgress({
          stage: `No transcript — skipped “${videoTitle}” (${short})`,
          found,
          written,
          skipped,
        });
        // Do NOT count toward maxNew — caption failures shouldn't burn extract budget.
        continue;
      }
      const cues = transcript.cues;

      onProgress({
        stage: `Writing up “${videoTitle}”…`,
        found,
        written,
        skipped,
      });

      try {
        const extracted = await extractRecipe(cues, {
          videoTitle,
        });

        const ingredients: Ingredient[] = extracted.ingredients;
        const steps = toSteps(extracted.steps);
        const confidence = confidenceOf(extracted.confidence);
        const addedAt = new Date(item.addedAt);
        const uploadedAt = publishedAtIso ? new Date(publishedAtIso) : null;

        if (writeMode === "insert") {
          await db.insert(recipes).values({
            userId,
            videoId: item.videoId,
            playlistId: item.playlistId,
            title: extracted.title,
            videoTitle,
            channelTitle,
            channelId,
            thumbnailUrl,
            cuisine: extracted.cuisine,
            mainIngredient: extracted.main_ingredient,
            cookMinutes: extracted.cook_minutes,
            servings: extracted.servings,
            ingredients,
            steps,
            confidence,
            verified: markVerified,
            videoStatus: "ok",
            uploadedAt,
            addedAt,
            writtenAt: new Date(),
          });
        } else if (existing) {
          // update unverified only; may flip to verified per prefs
          await db
            .update(recipes)
            .set({
              playlistId: item.playlistId,
              title: extracted.title,
              videoTitle,
              channelTitle,
              channelId,
              thumbnailUrl: thumbnailUrl ?? undefined,
              cuisine: extracted.cuisine,
              mainIngredient: extracted.main_ingredient,
              cookMinutes: extracted.cook_minutes,
              servings: extracted.servings,
              ingredients,
              steps,
              confidence,
              verified: markVerified,
              videoStatus: "ok",
              uploadedAt: uploadedAt ?? undefined,
              writtenAt: new Date(),
            })
            .where(
              and(
                eq(recipes.id, existing.id),
                eq(recipes.userId, userId),
                eq(recipes.verified, false),
              ),
            );
        }

        await learnCategoriesFromLabels(userId, {
          cuisine: extracted.cuisine,
          main: extracted.main_ingredient,
        }).catch(() => {
          /* non-fatal: recipe write already succeeded */
        });

        written += 1;
        processedNew += 1;
        existingByVideo.set(item.videoId, {
          id: existing?.id ?? "",
          videoId: item.videoId,
          verified: markVerified,
          archivedAt: null,
          videoStatus: "ok",
        });
      } catch (err) {
        skipped += 1;
        processedNew += 1; // extract attempt burns Claude budget
        detail.errors.push({
          videoId: item.videoId,
          message: formatSyncError(err),
        });
        onProgress({
          stage: `Extract failed for “${videoTitle}”: ${formatSyncError(err).slice(0, 120)}`,
          found,
          written,
          skipped,
        });
      }
    }

    // Local membership reconcile (DB only — cheap).
    // YouTube videos.list for "gone" is expensive (~all library IDs); only run when
    // this pass actually tried extract work, or when FORCE_STATUS_CHECK=1.
    const activeLibrary = await db
      .select({
        id: recipes.id,
        videoId: recipes.videoId,
        videoStatus: recipes.videoStatus,
        channelTitle: recipes.channelTitle,
        channelId: recipes.channelId,
      })
      .from(recipes)
      .where(
        and(
          eq(recipes.userId, userId),
          isNull(recipes.archivedAt),
          isNull(recipes.deletedAt),
        ),
      );

    onProgress({
      stage: "Updating playlist membership…",
      found,
      written,
      skipped,
    });

    for (const row of activeLibrary) {
      if (!inPlaylist.has(row.videoId) && row.videoStatus !== "gone") {
        if (row.videoStatus !== "off_playlist") {
          await db
            .update(recipes)
            .set({ videoStatus: "off_playlist" })
            .where(eq(recipes.id, row.id));
        }
      } else if (
        inPlaylist.has(row.videoId) &&
        row.videoStatus === "off_playlist"
      ) {
        await db
          .update(recipes)
          .set({ videoStatus: "ok" })
          .where(eq(recipes.id, row.id));
      }
    }

    const forceStatus =
      process.env.FORCE_STATUS_CHECK === "1" ||
      process.env.FORCE_STATUS_CHECK === "true";
    const didExtractWork = written > 0 || processedNew > 0;

    if (didExtractWork || forceStatus) {
      onProgress({
        stage: "Checking video status…",
        found,
        written,
        skipped,
      });
      // Only probe videos not already marked gone (saves API quota + time).
      const toCheck = activeLibrary.filter((r) => r.videoStatus !== "gone");
      if (toCheck.length > 0) {
        const statuses = await getVideosMeta(
          accessToken,
          toCheck.map((r) => r.videoId),
        );
        for (const row of toCheck) {
          const st = statuses.get(row.videoId);
          if (!st) continue;
          if (!st.exists) {
            await db
              .update(recipes)
              .set({ videoStatus: "gone" })
              .where(eq(recipes.id, row.id));
            continue;
          }
          // Credit uploader only when missing or changed
          if (
            st.channelTitle &&
            (st.channelTitle !== row.channelTitle ||
              (st.channelId && st.channelId !== row.channelId))
          ) {
            await db
              .update(recipes)
              .set({
                channelTitle: st.channelTitle,
                ...(st.channelId ? { channelId: st.channelId } : {}),
              })
              .where(eq(recipes.id, row.id));
          }
        }
      }
    }

    if (detail.needTranscript.length > 0 && written === 0 && found > 0) {
      result = `${detail.needTranscript.length} no transcript`;
    } else if (written === 0 && found === 0) {
      result = "no change";
    } else if (written === 0 && skipped > 0 && detail.errors.length > 0) {
      result = "error";
    } else {
      result = "ok";
    }

    onProgress({
      stage:
        written > 0
          ? `Done — ${written} recipe${written === 1 ? "" : "s"} added`
          : result === "no change"
            ? "Done — no change"
            : `Done — ${skipped} skipped`,
      found,
      written,
      skipped,
    });

    return finish({ found, written, skipped, result, detail });
  } catch (err) {
    if (isQuotaError(err)) {
      result = "quota hit";
    } else {
      result = "error";
    }
    detail.errors.push({
      message: err instanceof Error ? err.message : String(err),
    });
    onProgress({
      stage: result === "quota hit" ? "Quota hit — try later" : "Sync error",
      found,
      written,
      skipped,
    });
    return finish({ found, written, skipped, result, detail });
  }
}

/** Users who have at least one selected playlist (for cron). */
export async function listUserIdsWithSelectedPlaylists(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ userId: playlists.userId })
    .from(playlists)
    .where(eq(playlists.selected, true));
  return rows.map((r) => r.userId);
}

/** Recent sync_runs for a user. */
export async function listSyncHistory(
  userId: string,
  limit = 20,
): Promise<
  Array<{
    id: number;
    startedAt: string;
    finishedAt: string | null;
    found: number;
    written: number;
    skipped: number;
    result: string | null;
    detail: unknown;
  }>
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.userId, userId))
    .orderBy(desc(syncRuns.startedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    found: r.found,
    written: r.written,
    skipped: r.skipped,
    result: r.result,
    detail: r.detail,
  }));
}

export async function getSyncStatusSummary(userId: string): Promise<{
  selectedPlaylists: Array<{
    id: string;
    title: string;
    lastSynced: string | null;
  }>;
  lastRun: Awaited<ReturnType<typeof listSyncHistory>>[number] | null;
  unverifiedCount: number;
  needTranscriptCount: number;
}> {
  const db = getDb();

  const selectedPlaylists = await db
    .select({
      id: playlists.id,
      title: playlists.title,
      lastSynced: playlists.lastSynced,
    })
    .from(playlists)
    .where(and(eq(playlists.userId, userId), eq(playlists.selected, true)));

  const history = await listSyncHistory(userId, 1);
  const lastRun = history[0] ?? null;

  const [unverified] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(recipes)
    .where(
      and(
        eq(recipes.userId, userId),
        eq(recipes.verified, false),
        isNull(recipes.archivedAt),
      ),
    );

  let needTranscriptCount = 0;
  try {
    needTranscriptCount = (await listCaptionSkips(userId)).length;
  } catch {
    const detail = lastRun?.detail as SyncDetail | null;
    if (detail?.needTranscript?.length) {
      needTranscriptCount = detail.needTranscript.length;
    }
  }

  return {
    selectedPlaylists: selectedPlaylists.map((p) => ({
      id: p.id,
      title: p.title,
      lastSynced: p.lastSynced?.toISOString() ?? null,
    })),
    lastRun,
    unverifiedCount: unverified?.n ?? 0,
    needTranscriptCount,
  };
}

/** Compact caption failure for logs/UI (full dump is huge). */
export function shortTranscriptReason(
  kind: string | undefined,
  reason: string,
): string {
  if (kind === "no_captions") {
    return "no captions (uploader has none / ASR off)";
  }
  if (kind === "auth_blocked") {
    return "auth blocked (LOGIN_REQUIRED — cookies/IP; not “no captions”)";
  }
  if (kind === "unavailable") {
    return "video unavailable / deleted";
  }
  if (kind === "captcha") {
    return "captcha required";
  }
  if (kind === "empty_body") {
    return "caption tracks listed but body empty";
  }
  // Legacy strings without kind
  if (/no caption tracks/i.test(reason) && !/LOGIN_REQUIRED\b/.test(reason)) {
    return "no captions (uploader has none / ASR off)";
  }
  if (/\bLOGIN_REQUIRED\b/.test(reason) && !/or captions off/i.test(reason)) {
    return "auth blocked (LOGIN_REQUIRED — cookies/IP)";
  }
  if (/no longer available|terminated|Video unavailable/i.test(reason)) {
    return "video unavailable / deleted";
  }
  return reason.length > 180 ? `${reason.slice(0, 180)}…` : reason;
}

export function formatSyncError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
