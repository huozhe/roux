/** Built-in cuisine / main chips. LLM + user labels extend via prefs.custom*. */
export const CUISINES = [
  "Sichuan",
  "Chinese",
  "Japanese",
  "Korean",
  "Thai",
  "Indian",
  "Italian",
  "French",
  "Mexican",
  "American",
] as const;

export const MAINS = [
  "Beef",
  "Pork",
  "Chicken",
  "Seafood",
  "Tofu",
  "Vegetable",
  "Noodles",
] as const;

export type Cuisine = (typeof CUISINES)[number];
export type MainIngredient = (typeof MAINS)[number];

const BASE_CUISINE_KEYS = new Set(
  CUISINES.map((s) => s.toLowerCase()),
);
const BASE_MAIN_KEYS = new Set(MAINS.map((s) => s.toLowerCase()));

/** Base list + extra labels (deduped, case-insensitive). */
export function categoryOptions(
  base: readonly string[],
  custom?: string[] | null,
): string[] {
  const seen = new Set(base.map((s) => s.toLowerCase()));
  const out = [...base];
  for (const raw of custom ?? []) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Merge novel cuisine/main labels into custom lists (skip base list items).
 * Pure — returns null if nothing new.
 */
export function mergeLearnedCategories(
  current: { customCuisines?: string[]; customMains?: string[] },
  labels: { cuisine?: string | null; main?: string | null },
): { customCuisines: string[]; customMains: string[] } | null {
  const customCuisines = [...(current.customCuisines ?? [])];
  const customMains = [...(current.customMains ?? [])];
  const cuisineKeys = new Set(customCuisines.map((s) => s.toLowerCase()));
  const mainKeys = new Set(customMains.map((s) => s.toLowerCase()));
  let dirty = false;

  const cuisine = labels.cuisine?.trim();
  if (cuisine) {
    const key = cuisine.toLowerCase();
    if (!BASE_CUISINE_KEYS.has(key) && !cuisineKeys.has(key)) {
      customCuisines.push(cuisine);
      cuisineKeys.add(key);
      dirty = true;
    }
  }

  const main = labels.main?.trim();
  if (main) {
    const key = main.toLowerCase();
    if (!BASE_MAIN_KEYS.has(key) && !mainKeys.has(key)) {
      customMains.push(main);
      mainKeys.add(key);
      dirty = true;
    }
  }

  if (!dirty) return null;
  return { customCuisines, customMains };
}
