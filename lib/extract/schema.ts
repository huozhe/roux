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

/** Pull outermost JSON object from model text (fences, leading prose, trailing junk). */
export function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  let body = (fenced ? fenced[1]! : trimmed).trim();

  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) {
    body = body.slice(start, end + 1);
  }
  return body;
}

export function formatParseError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Strip fences / prose then JSON.parse + Zod validate. */
export function parseExtractedJson(raw: string): ExtractedRecipe {
  const body = extractJsonObject(raw);
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON: ${msg}`);
  }
  try {
    return extractedRecipeSchema.parse(data) as ExtractedRecipe;
  } catch (err) {
    throw new Error(formatParseError(err));
  }
}
