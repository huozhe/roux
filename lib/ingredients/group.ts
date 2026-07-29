import type { Ingredient } from "@/lib/types";

export type IngredientGroupId =
  | "protein"
  | "produce"
  | "aromatics"
  | "spices"
  | "sauces"
  | "liquids"
  | "other";

export type IngredientGroup = {
  id: IngredientGroupId;
  label: string;
  items: Array<Ingredient & { index: number }>;
};

const GROUP_ORDER: IngredientGroupId[] = [
  "protein",
  "produce",
  "aromatics",
  "spices",
  "sauces",
  "liquids",
  "other",
];

const LABELS: Record<IngredientGroupId, string> = {
  protein: "Protein",
  produce: "Vegetables & produce",
  aromatics: "Aromatics",
  spices: "Spices & dry seasonings",
  sauces: "Sauces & condiments",
  liquids: "Liquids",
  other: "Other",
};

/** Keyword matchers — first matching group wins. */
const RULES: Array<{ id: IngredientGroupId; re: RegExp }> = [
  {
    // Before protein so "chicken stock" / "beef broth" land here
    id: "liquids",
    re: /\b(water|stock|broth|oil|liquid|slurry|milk|cream|coconut milk)\b/i,
  },
  {
    id: "protein",
    re: /\b(beef|pork|chicken|lamb|duck|fish|salmon|shrimp|prawn|tofu|egg|bacon|ham|sausage|meat|thigh|rib|tender|fillet|mock tender)\b/i,
  },
  {
    id: "aromatics",
    re: /\b(garlic|ginger|scallion|green onion|spring onion|shallot|onion|leek|chili|chilli|peppercorn|star anise|bay leaf|cinnamon|lemongrass)\b/i,
  },
  {
    id: "spices",
    re: /\b(salt|pepper|sugar|honey|sichuan|five.?spice|cumin|coriander seed|fennel|clove|cardamom|turmeric|paprika|chili powder|msg|bouillon)\b/i,
  },
  {
    id: "sauces",
    re: /\b(soy|oyster|fish sauce|worcester|hoisin|douban|bean paste|vinegar|mirin|wine|shaoxing|ketchup|mustard|sesame paste|chili oil|sauce)\b/i,
  },
  {
    id: "produce",
    re: /\b(cabbage|carrot|celery|mushroom|potato|tomato|pepper|eggplant|zucchini|bean|pea|corn|lettuce|herb|cilantro|coriander|basil|parsley|pickle|mustard stem|ya cai)\b/i,
  },
];

export function classifyIngredient(name: string): IngredientGroupId {
  const n = name.trim();
  if (!n) return "other";
  for (const rule of RULES) {
    if (rule.re.test(n)) return rule.id;
  }
  return "other";
}

/**
 * Group ingredients for display (one item per row under section labels).
 * Preserves original order within each group.
 */
export function groupIngredients(ingredients: Ingredient[]): IngredientGroup[] {
  const buckets = new Map<IngredientGroupId, Array<Ingredient & { index: number }>>();
  for (const id of GROUP_ORDER) buckets.set(id, []);

  ingredients.forEach((ing, index) => {
    const id = classifyIngredient(ing.name);
    buckets.get(id)!.push({ ...ing, index });
  });

  return GROUP_ORDER.map((id) => ({
    id,
    label: LABELS[id],
    items: buckets.get(id)!,
  })).filter((g) => g.items.length > 0);
}
