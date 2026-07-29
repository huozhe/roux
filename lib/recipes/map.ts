import type { RecipeRow } from "@/lib/db/schema";
import type { Confidence, Recipe, VideoStatus } from "@/lib/types";

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

/** DB row (drizzle camelCase) → API `Recipe` (snake-ish). */
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
    ingredients: row.ingredients ?? [],
    steps: row.steps ?? [],
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
