/** Controlled lists for cuisine / main chips. Users may extend via prefs later. */
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
