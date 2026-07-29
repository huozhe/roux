import { FIXTURE_RECIPES } from "@/lib/fixtures/recipes";
import { filterAndSortRecipes } from "@/lib/search";
import type { Recipe, RecipeListParams } from "@/lib/types";

/**
 * Data adapter boundary. Fixture-backed until integration wave (M4) swaps to live API/DB.
 * Set ROUX_DATA=live later to flip; default is fixtures.
 */
const useLive = process.env.ROUX_DATA === "live";

export async function listRecipes(
  params: RecipeListParams = {},
): Promise<Recipe[]> {
  if (useLive) {
    throw new Error("Live recipe adapter not implemented yet (wire at M4)");
  }
  return filterAndSortRecipes(FIXTURE_RECIPES, params);
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  if (useLive) {
    throw new Error("Live recipe adapter not implemented yet (wire at M4)");
  }
  return FIXTURE_RECIPES.find((r) => r.id === id) ?? null;
}
