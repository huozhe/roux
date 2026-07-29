import { FIXTURE_RECIPES } from "@/lib/fixtures/recipes";
import type { Recipe } from "@/lib/types";

/**
 * Fixture share slugs → recipe ids.
 * Production will look up share_links; this is enough for T8 UI + public page.
 */
export const FIXTURE_SHARE_SLUGS: Record<string, string> = {
  "mapo-tofu-a7f3": "r1",
  "oyakodon-b2c1": "r2",
  "carnitas-c3d2": "r3",
  "coq-au-vin-blanc-d4e3": "r4",
  "dan-dan-noodles-e5f4": "r5",
  "cacio-e-pepe-f6a5": "r6",
};

/** Resolve a public share slug to a fixture recipe (or null). */
export function getSharedRecipeBySlug(slug: string): Recipe | null {
  const id = FIXTURE_SHARE_SLUGS[slug];
  if (!id) return null;
  return FIXTURE_RECIPES.find((r) => r.id === id) ?? null;
}

/** Known fixture share entries for Settings empty/list prototypes. */
export function listFixtureShareEntries(): {
  slug: string;
  recipeId: string;
  title: string;
}[] {
  return Object.entries(FIXTURE_SHARE_SLUGS).flatMap(([slug, recipeId]) => {
    const recipe = FIXTURE_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return [];
    return [{ slug, recipeId, title: recipe.title }];
  });
}
