import { and, eq, isNull } from "drizzle-orm";
import { getDb, recipes } from "@/lib/db";
import { rowToRecipe } from "@/lib/recipes/map";
import { filterAndSortRecipes } from "@/lib/search";
import type { Recipe, RecipeListParams } from "@/lib/types";

/** All non-deleted recipes for a user (library + archive); filter/sort in memory. */
export async function listRecipesFromDb(
  userId: string,
  params: RecipeListParams = {},
): Promise<Recipe[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.userId, userId), isNull(recipes.deletedAt)));

  return filterAndSortRecipes(rows.map(rowToRecipe), params);
}

export async function getRecipeFromDb(
  userId: string,
  id: string,
): Promise<Recipe | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(recipes)
    .where(
      and(
        eq(recipes.userId, userId),
        eq(recipes.id, id),
        isNull(recipes.deletedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row ? rowToRecipe(row) : null;
}
