import { getSharedRecipeBySlug as getSharedFixture } from "@/lib/fixtures/shares";
import type { Recipe } from "@/lib/types";

/**
 * Public share resolve. Prefer live DB when DATABASE_URL is set;
 * fall back to fixtures for local UI without a database.
 */
export async function getSharedRecipeBySlug(
  slug: string,
): Promise<Recipe | null> {
  if (process.env.DATABASE_URL) {
    try {
      const { getSharedRecipeBySlug: fromDb } = await import(
        "@/lib/recipes/queries"
      );
      return await fromDb(slug);
    } catch {
      return null;
    }
  }
  return getSharedFixture(slug);
}
