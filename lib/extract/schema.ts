import { z } from "zod";
import type { ExtractedRecipe } from "@/lib/types";

export const ingredientSchema = z.object({
  qty: z.string(),
  name: z.string().min(1),
  inferred: z.boolean(),
  group: z.string().min(1),
});

export const stepSchema = z.object({
  text: z.string().min(1),
  t_seconds: z.number().nonnegative(),
});

export const extractedRecipeSchema = z.object({
  title: z.string().min(1),
  cuisine: z.string().nullable(),
  main_ingredient: z.string().nullable(),
  cook_minutes: z.number().positive().nullable(),
  servings: z.string().nullable(),
  ingredients: z.array(ingredientSchema).min(1),
  steps: z.array(stepSchema).min(1),
  confidence: z.enum(["high", "medium", "low"]),
});

/** Strip optional ```json fences then JSON.parse + Zod validate. */
export function parseExtractedJson(raw: string): ExtractedRecipe {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = fenced ? fenced[1]!.trim() : trimmed;
  const data: unknown = JSON.parse(body);
  return extractedRecipeSchema.parse(data) as ExtractedRecipe;
}
