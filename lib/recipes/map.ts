import type { RecipeRow } from "@/lib/db/schema";
import type {
  Confidence,
  Ingredient,
  Recipe,
  Step,
  VideoStatus,
} from "@/lib/types";

function iso(d: Date | null | undefined): string | null {
  if (d == null) return null;
  return d.toISOString();
}

function asConfidence(v: string): Confidence {
  if (v === "high" || v === "medium" || v === "low") return v;
  return "medium";
}

function asVideoStatus(v: string): VideoStatus {
  if (v === "ok" || v === "gone" || v === "off_playlist") return v;
  return "ok";
}

/** Coerce jsonb ingredients (LLM / PATCH may be partial). */
export function asIngredients(v: unknown): Ingredient[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => {
    const o = item as Partial<Ingredient>;
    const group =
      typeof o.group === "string" && o.group.trim() ? o.group.trim() : undefined;
    return {
      qty: typeof o.qty === "string" ? o.qty : "",
      name: typeof o.name === "string" ? o.name : "",
      inferred: Boolean(o.inferred),
      ...(group ? { group } : {}),
    };
  });
}

/** Coerce jsonb steps; renumber when `n` missing. */
export function asSteps(v: unknown): Step[] {
  if (!Array.isArray(v)) return [];
  return v.map((item, i) => {
    const o = item as Partial<Step>;
    return {
      n: typeof o.n === "number" ? o.n : i + 1,
      text: typeof o.text === "string" ? o.text : "",
      t_seconds: typeof o.t_seconds === "number" ? o.t_seconds : 0,
    };
  });
}

/** DB row (drizzle camelCase) → API `Recipe` (snake-ish). Single mapper for SSR + API. */
export function rowToRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    video_id: row.videoId,
    title: row.title,
    video_title: row.videoTitle,
    channel_title: row.channelTitle,
    channel_id: row.channelId,
    thumbnail_url: row.thumbnailUrl,
    cuisine: row.cuisine,
    main_ingredient: row.mainIngredient,
    cook_minutes: row.cookMinutes,
    servings: row.servings,
    ingredients: asIngredients(row.ingredients),
    steps: asSteps(row.steps),
    notes: row.notes,
    confidence: asConfidence(row.confidence),
    verified: row.verified,
    video_status: asVideoStatus(row.videoStatus),
    playlist_id: row.playlistId,
    uploaded_at: iso(row.uploadedAt),
    added_at: iso(row.addedAt) ?? new Date(0).toISOString(),
    written_at: iso(row.writtenAt) ?? new Date(0).toISOString(),
    archived_at: iso(row.archivedAt),
  };
}

/**
 * Public share surface: strip private fields.
 * Used by getSharedRecipeBySlug (and tests) so privacy cannot drift.
 */
export function stripRecipeForPublicShare(recipe: Recipe): Recipe {
  return { ...recipe, notes: null, verified: false };
}
