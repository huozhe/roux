import { LibraryClient } from "@/components/library/LibraryClient";
import { listRecipes } from "@/lib/data/recipes";

/**
 * Library is the app home. Loads fixtures via the data adapter (swap to live at M4).
 * Filters run client-side with the same pure helper listRecipes uses.
 */
export default async function LibraryPage() {
  // Adapter has no "all" view — merge both so client can switch Library/Archive.
  const [library, archive] = await Promise.all([
    listRecipes({ view: "library" }),
    listRecipes({ view: "archive" }),
  ]);
  const recipes = [...library, ...archive];

  return <LibraryClient recipes={recipes} lastSyncLabel="2 hours ago" />;
}
