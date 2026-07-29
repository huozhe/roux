import { formatCookMinutes, formatQty, formatTimestamp } from "@/lib/format";
import type { Recipe } from "@/lib/types";

/** One recipe as Markdown, including private notes. */
export function recipeToMarkdown(recipe: Recipe): string {
  const lines: string[] = [];

  lines.push(`# ${recipe.title}`);
  lines.push("");

  const meta: string[] = [];
  if (recipe.cuisine) meta.push(recipe.cuisine);
  if (recipe.main_ingredient) meta.push(recipe.main_ingredient);
  const time = formatCookMinutes(recipe.cook_minutes);
  if (time) meta.push(time);
  if (recipe.servings) meta.push(recipe.servings);
  if (meta.length) {
    lines.push(meta.join(" · "));
    lines.push("");
  }

  lines.push(
    `From “${recipe.video_title}” by ${recipe.channel_title} (\`${recipe.video_id}\`)`,
  );
  lines.push("");

  lines.push("## Ingredients");
  lines.push("");
  for (const ing of recipe.ingredients) {
    const qty = formatQty(ing);
    lines.push(`- **${qty}** ${ing.name}`);
  }
  lines.push("");

  lines.push("## Steps");
  lines.push("");
  for (const step of recipe.steps) {
    const t = formatTimestamp(step.t_seconds);
    lines.push(`${step.n}. ${step.text} _(at ${t})_`);
  }
  lines.push("");

  if (recipe.notes?.trim()) {
    lines.push("## Notes");
    lines.push("");
    lines.push(recipe.notes.trim());
    lines.push("");
  }

  return lines.join("\n");
}
