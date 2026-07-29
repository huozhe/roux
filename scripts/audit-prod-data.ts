/**
 * One-off prod data audit. Usage: node --import tsx scripts/audit-prod-data.ts
 */
import { loadEnvLocal } from "./load-env-local.ts";
loadEnvLocal();

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const users = await sql`
    SELECT id, email, google_sub, prefs, created_at
    FROM roux.users
    ORDER BY created_at
  `;
  console.log("USERS", users.length);
  for (const u of users) {
    console.log({
      id: u.id,
      email: u.email,
      google_sub: u.google_sub,
      prefs: u.prefs,
    });
  }

  const orphanRecipes = await sql`
    SELECT count(*)::int AS n FROM roux.recipes r
    LEFT JOIN roux.users u ON u.id = r.user_id
    WHERE u.id IS NULL
  `;
  const orphanPlaylists = await sql`
    SELECT count(*)::int AS n FROM roux.playlists p
    LEFT JOIN roux.users u ON u.id = p.user_id
    WHERE u.id IS NULL
  `;
  const orphanSync = await sql`
    SELECT count(*)::int AS n FROM roux.sync_runs s
    LEFT JOIN roux.users u ON u.id = s.user_id
    WHERE u.id IS NULL
  `;
  const orphanTomb = await sql`
    SELECT count(*)::int AS n FROM roux.recipe_tombstones t
    LEFT JOIN roux.users u ON u.id = t.user_id
    WHERE u.id IS NULL
  `;
  const orphanShares = await sql`
    SELECT count(*)::int AS n FROM roux.share_links sl
    LEFT JOIN roux.recipes r ON r.id = sl.recipe_id
    WHERE r.id IS NULL
  `;
  console.log("ORPHANS", {
    recipes: orphanRecipes[0]?.n,
    playlists: orphanPlaylists[0]?.n,
    sync_runs: orphanSync[0]?.n,
    tombstones: orphanTomb[0]?.n,
    shares: orphanShares[0]?.n,
  });

  const recipeHealth = await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE thumbnail_url IS NULL)::int AS no_thumb,
      count(*) FILTER (WHERE channel_title IS NULL OR channel_title = '')::int AS no_channel,
      count(*) FILTER (WHERE ingredients = '[]'::jsonb)::int AS empty_ingredients,
      count(*) FILTER (WHERE steps = '[]'::jsonb)::int AS empty_steps,
      count(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archived,
      count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS soft_deleted,
      count(*) FILTER (WHERE video_status NOT IN ('ok','gone','off_playlist'))::int AS bad_status
    FROM roux.recipes
  `;
  console.log("RECIPE_HEALTH", recipeHealth[0]);

  const recipes = await sql`
    SELECT id, video_id, title, channel_title, channel_id, thumbnail_url,
      cuisine, main_ingredient,
      jsonb_array_length(ingredients) AS n_ing,
      jsonb_array_length(steps) AS n_steps,
      confidence, verified, video_status, playlist_id,
      ingredients, steps
    FROM roux.recipes
  `;
  for (const r of recipes) {
    const ings = r.ingredients as Array<{ group?: string; qty?: string; name?: string }>;
    const steps = r.steps as Array<{ n?: number; text?: string; t_seconds?: number }>;
    console.log("RECIPE", {
      id: r.id,
      video_id: r.video_id,
      title: r.title,
      channel_title: r.channel_title,
      channel_id: r.channel_id,
      thumbnail_url: r.thumbnail_url,
      n_ing: r.n_ing,
      n_steps: r.n_steps,
      video_status: r.video_status,
      groups: ings.map((i) => i.group ?? null),
      missingGroup: ings.filter((i) => !i.group).length,
      badSteps: steps.filter(
        (s) => typeof s.t_seconds !== "number" || !s.text,
      ).length,
    });
  }

  const selected = await sql`
    SELECT id, title, item_count, last_synced
    FROM roux.playlists WHERE selected = true
  `;
  console.log("SELECTED_PLAYLISTS", selected);

  const syncs = await sql`
    SELECT id, started_at, finished_at, found, written, skipped, result
    FROM roux.sync_runs ORDER BY started_at DESC LIMIT 8
  `;
  console.log("RECENT_SYNCS", syncs);

  const shares = await sql`
    SELECT sl.slug, sl.revoked_at, r.title
    FROM roux.share_links sl
    JOIN roux.recipes r ON r.id = sl.recipe_id
  `;
  console.log("SHARES", shares);

  // Non-UUID-looking ids should be impossible (column type) — still report
  const userIds = await sql`SELECT id::text AS id, google_sub FROM roux.users`;
  for (const u of userIds) {
    const uuidish =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        u.id as string,
      );
    if (!uuidish) console.log("BAD_USER_ID", u);
    if (u.id === u.google_sub) console.log("ID_EQUALS_GOOGLE_SUB", u);
  }

  console.log("DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
