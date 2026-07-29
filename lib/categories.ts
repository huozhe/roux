/** Controlled lists for cuisine / main chips. Users may extend via prefs. */
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

/** Base list + user customs (deduped, case-insensitive). */
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
