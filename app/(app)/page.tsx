import { LibraryClient } from "@/components/library/LibraryClient";
import { auth } from "@/lib/auth";
import { listRecipes } from "@/lib/data/recipes";
import { relativeAgo } from "@/lib/format";
import { resolveAppUserId } from "@/lib/recipes/auth";
import { getUserPrefs } from "@/lib/recipes/queries";
import { getSyncStatusSummary } from "@/lib/sync";
import { DEFAULT_PREFS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Library home. Live DB when signed in + DATABASE_URL; else fixtures.
 */
export default async function LibraryPage() {
  const [library, archive] = await Promise.all([
    listRecipes({ view: "library" }),
    listRecipes({ view: "archive" }),
  ]);
  const recipes = [...library, ...archive];

  let lastSyncLabel = "never";
  let prefs = DEFAULT_PREFS;

  const session = await auth().catch(() => null);
  const userId = await resolveAppUserId(session?.user?.id);
  if (userId && process.env.DATABASE_URL) {
    try {
      prefs = await getUserPrefs(userId);
      const status = await getSyncStatusSummary(userId);
      const finished = status.lastRun?.finishedAt ?? status.lastRun?.startedAt;
      if (finished) {
        lastSyncLabel = relativeAgo(finished);
      } else {
        const playlistTimes = status.selectedPlaylists
          .map((p) => p.lastSynced)
          .filter((t): t is string => Boolean(t));
        if (playlistTimes.length) {
          playlistTimes.sort();
          lastSyncLabel = relativeAgo(playlistTimes[playlistTimes.length - 1]!);
        }
      }
    } catch {
      /* keep defaults */
    }
  }

  return (
    <LibraryClient
      recipes={recipes}
      lastSyncLabel={lastSyncLabel}
      prefs={prefs}
    />
  );
}
