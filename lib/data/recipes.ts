import { FIXTURE_RECIPES } from "@/lib/fixtures/recipes";
import { filterAndSortRecipes } from "@/lib/search";
import type { Recipe, RecipeListParams } from "@/lib/types";

export type ListRecipesOpts = {
  /** When set (or auth session has a user), prefer DB if DATABASE_URL is present. */
  userId?: string;
};

/**
 * Live DB when DATABASE_URL is set; fixtures only for no-DB demo.
 * ARCH-2: live list uses SQL (`queries.listRecipes`). On DB errors, throw
 * (error.tsx) — never silently serve FIXTURE_RECIPES in a deployed app.
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

export async function listRecipes(
  params: RecipeListParams = {},
  opts?: ListRecipesOpts,
): Promise<Recipe[]> {
  // Fixture demo only when there is no database — never when DB is configured.
  if (!process.env.DATABASE_URL) {
    return filterAndSortRecipes(FIXTURE_RECIPES, params);
  }

  const userId = await resolveUserId(opts);
  if (!userId) return [];

  const { listRecipes: listFromSql } = await import("@/lib/recipes/queries");
  return listFromSql(userId, params);
}

export async function getRecipe(
  id: string,
  opts?: ListRecipesOpts,
): Promise<Recipe | null> {
  if (!process.env.DATABASE_URL) {
    return FIXTURE_RECIPES.find((r) => r.id === id) ?? null;
  }

  const userId = await resolveUserId(opts);
  if (!userId) return null;

  const { getRecipe: getFromSql } = await import("@/lib/recipes/queries");
  return getFromSql(userId, id);
}
