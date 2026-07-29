import { FIXTURE_RECIPES } from "@/lib/fixtures/recipes";
import { filterAndSortRecipes } from "@/lib/search";
import type { Recipe, RecipeListParams } from "@/lib/types";
import { getRecipeFromDb, listRecipesFromDb } from "./db-recipes";

export type ListRecipesOpts = {
  /** When set (or auth session has a user), prefer DB if DATABASE_URL is present. */
  userId?: string;
};

/**
 * Prefer live DB when ROUX_DATA=live OR a userId is available (session),
 * and DATABASE_URL is configured. Otherwise fixtures.
 */
async function resolveUserId(opts?: ListRecipesOpts): Promise<string | null> {
  if (opts?.userId) return opts.userId;
  try {
    const { auth } = await import("@/lib/auth");
    const { resolveAppUserId } = await import("@/lib/recipes/auth");
    const session = await auth();
    return resolveAppUserId(session?.user?.id);
  } catch {
    return null;
  }
}

function wantLive(userId: string | null): boolean {
  if (!process.env.DATABASE_URL) return false;
  if (process.env.ROUX_DATA === "live") return Boolean(userId);
  return Boolean(userId);
}

export async function listRecipes(
  params: RecipeListParams = {},
  opts?: ListRecipesOpts,
): Promise<Recipe[]> {
  try {
    const userId = await resolveUserId(opts);
    if (wantLive(userId) && userId) {
      return listRecipesFromDb(userId, params);
    }
  } catch {
    /* fall through to fixtures */
  }
  return filterAndSortRecipes(FIXTURE_RECIPES, params);
}

export async function getRecipe(
  id: string,
  opts?: ListRecipesOpts,
): Promise<Recipe | null> {
  try {
    const userId = await resolveUserId(opts);
    if (wantLive(userId) && userId) {
      return getRecipeFromDb(userId, id);
    }
  } catch {
    /* fall through to fixtures */
  }
  return FIXTURE_RECIPES.find((r) => r.id === id) ?? null;
}
