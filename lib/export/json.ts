import type { Recipe } from "@/lib/types";

/** Serialize recipes as pretty JSON (includes notes — user's own data). */
export function recipesToJson(recipes: Recipe[]): string {
  return JSON.stringify(recipes, null, 2);
}
