import type { Ingredient } from "@/lib/types";

export type IngredientGroup = {
  /** Stable key for React lists */
  id: string;
  label: string;
  items: Array<Ingredient & { index: number }>;
};

/**
 * Group ingredients for display.
 * When LLM provided `group` labels, respect array order and consecutive groups.
 * Legacy rows without `group` fall back to a single unlabelled list (preserve order).
 */
export function groupIngredients(ingredients: Ingredient[]): IngredientGroup[] {
  if (ingredients.length === 0) return [];

  const hasLlmGroups = ingredients.some((i) => i.group?.trim());
  if (!hasLlmGroups) {
    return [
      {
        id: "all",
        label: "",
        items: ingredients.map((ing, index) => ({ ...ing, index })),
      },
    ];
  }

  const groups: IngredientGroup[] = [];
  for (let index = 0; index < ingredients.length; index++) {
    const ing = ingredients[index]!;
    const label = ing.group?.trim() || "Other";
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push({ ...ing, index });
    } else {
      groups.push({
        id: `${label}-${groups.length}`,
        label,
        items: [{ ...ing, index }],
      });
    }
  }
  return groups;
}
