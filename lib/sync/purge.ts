/**
 * Hard-delete recipes archived >30 days; write tombstones so sync won't resurrect.
 */
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, recipeTombstones, recipes, shareLinks } from "@/lib/db";

export type PurgeResult = {
  purged: number;
  tombstones: number;
};

/**
 * Recipes with archived_at older than 30 days are hard-deleted.
 * A recipe_tombstones row is upserted per (userId, videoId).
 * share_links cascade via FK on recipe delete.
 */
export async function purgeArchivedRecipes(
  olderThanDays = 30,
): Promise<PurgeResult> {
  const db = getDb();
  const cutoff = new Date(
    Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
  );

  const stale = await db
    .select({
      id: recipes.id,
      userId: recipes.userId,
      videoId: recipes.videoId,
    })
    .from(recipes)
    .where(
      and(isNotNull(recipes.archivedAt), lt(recipes.archivedAt, cutoff)),
    );

  if (stale.length === 0) {
    return { purged: 0, tombstones: 0 };
  }

  let tombstones = 0;
  for (const row of stale) {
    // Explicit share cleanup (cascade should handle; keep safe)
    await db.delete(shareLinks).where(eq(shareLinks.recipeId, row.id));

    await db
      .insert(recipeTombstones)
      .values({
        userId: row.userId,
        videoId: row.videoId,
        deletedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [recipeTombstones.userId, recipeTombstones.videoId],
        set: { deletedAt: sql`now()` },
      });
    tombstones += 1;

    await db.delete(recipes).where(eq(recipes.id, row.id));
  }

  return { purged: stale.length, tombstones };
}
