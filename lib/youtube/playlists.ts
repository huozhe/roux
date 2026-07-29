import { and, eq, inArray } from "drizzle-orm";
import { FIXTURE_PLAYLISTS } from "@/lib/fixtures/recipes";
import type { Playlist } from "@/lib/types";
import { getDb, playlists } from "@/lib/db";
import { listMinePlaylists, type YtPlaylist } from "@/lib/youtube/client";
import { getAccessTokenForUser } from "@/lib/youtube/tokens";

/** Pure merge: YouTube catalog + DB selection / last_synced. */
export function mergePlaylists(
  yt: YtPlaylist[],
  dbRows: Array<{
    id: string;
    selected: boolean;
    lastSynced: Date | null;
  }>,
): Playlist[] {
  const byId = new Map(dbRows.map((r) => [r.id, r]));
  return yt.map((p) => {
    const row = byId.get(p.id);
    return {
      id: p.id,
      title: p.title,
      visibility: p.visibility,
      item_count: p.item_count,
      selected: row?.selected ?? false,
      last_synced: row?.lastSynced?.toISOString() ?? null,
    };
  });
}

export function applySelection(
  list: Playlist[],
  selectedIds: string[],
): Playlist[] {
  const set = new Set(selectedIds);
  return list.map((p) => ({ ...p, selected: set.has(p.id) }));
}

export function fixturePlaylists(): Playlist[] {
  return FIXTURE_PLAYLISTS.map((p) => ({ ...p }));
}

/**
 * Refresh from YouTube, upsert metadata, return merged list.
 * Requires DATABASE_URL + user refresh token.
 */
export async function refreshUserPlaylists(userId: string): Promise<Playlist[]> {
  const accessToken = await getAccessTokenForUser(userId);
  const yt = await listMinePlaylists(accessToken);
  const db = getDb();

  const existing = await db
    .select({
      id: playlists.id,
      selected: playlists.selected,
      lastSynced: playlists.lastSynced,
    })
    .from(playlists)
    .where(eq(playlists.userId, userId));

  const existingIds = new Set(existing.map((r) => r.id));

  for (const p of yt) {
    if (existingIds.has(p.id)) {
      await db
        .update(playlists)
        .set({
          title: p.title,
          visibility: p.visibility,
          itemCount: p.item_count,
          userId,
        })
        .where(and(eq(playlists.id, p.id), eq(playlists.userId, userId)));
    } else {
      await db.insert(playlists).values({
        id: p.id,
        userId,
        title: p.title,
        visibility: p.visibility,
        itemCount: p.item_count,
        selected: false,
      });
    }
  }

  const rows = await db
    .select({
      id: playlists.id,
      selected: playlists.selected,
      lastSynced: playlists.lastSynced,
    })
    .from(playlists)
    .where(eq(playlists.userId, userId));

  return mergePlaylists(yt, rows);
}

/** Persist multi-select. Unknown ids are ignored. */
export async function setSelectedPlaylists(
  userId: string,
  selectedIds: string[],
): Promise<Playlist[]> {
  const db = getDb();
  const unique = [...new Set(selectedIds)];

  const owned = await db
    .select({ id: playlists.id })
    .from(playlists)
    .where(eq(playlists.userId, userId));
  const ownedIds = owned.map((r) => r.id);
  if (ownedIds.length === 0) {
    return [];
  }

  // Clear all, then set selected for intersection.
  await db
    .update(playlists)
    .set({ selected: false })
    .where(eq(playlists.userId, userId));

  const toSelect = unique.filter((id) => ownedIds.includes(id));
  if (toSelect.length > 0) {
    await db
      .update(playlists)
      .set({ selected: true })
      .where(
        and(eq(playlists.userId, userId), inArray(playlists.id, toSelect)),
      );
  }

  const rows = await db
    .select({
      id: playlists.id,
      title: playlists.title,
      visibility: playlists.visibility,
      itemCount: playlists.itemCount,
      selected: playlists.selected,
      lastSynced: playlists.lastSynced,
    })
    .from(playlists)
    .where(eq(playlists.userId, userId));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    visibility: r.visibility as Playlist["visibility"],
    item_count: r.itemCount,
    selected: r.selected,
    last_synced: r.lastSynced?.toISOString() ?? null,
  }));
}

export async function listStoredPlaylists(userId: string): Promise<Playlist[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: playlists.id,
      title: playlists.title,
      visibility: playlists.visibility,
      itemCount: playlists.itemCount,
      selected: playlists.selected,
      lastSynced: playlists.lastSynced,
    })
    .from(playlists)
    .where(eq(playlists.userId, userId));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    visibility: r.visibility as Playlist["visibility"],
    item_count: r.itemCount,
    selected: r.selected,
    last_synced: r.lastSynced?.toISOString() ?? null,
  }));
}
