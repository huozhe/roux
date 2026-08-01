import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  bigserial,
  primaryKey,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Ingredient, Step, UserPrefs } from "@/lib/types";

/**
 * All app tables live in the `roux` schema (not `public`).
 * Postgres term: schema = namespace. Tablespace = physical storage (unused here).
 */
export const roux = pgSchema("roux");

export const users = roux.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  googleSub: text("google_sub").notNull().unique(),
  /** AES-GCM ciphertext (lib/crypto); never store plaintext. */
  refreshToken: text("refresh_token"),
  prefs: jsonb("prefs")
    .$type<UserPrefs>()
    .notNull()
    .default(
      sql`'{"layout":"single","timestamps":true,"newShelf":false,"syncMarkVerified":false}'::jsonb`,
    ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const playlists = roux.table("playlists", {
  id: text("id").primaryKey(), // YouTube playlist id
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  visibility: text("visibility").notNull(), // private | unlisted | public
  itemCount: integer("item_count").notNull().default(0),
  selected: boolean("selected").notNull().default(false),
  lastSynced: timestamp("last_synced", { withTimezone: true }),
});

export const recipes = roux.table(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: text("video_id").notNull(),
    playlistId: text("playlist_id").references(() => playlists.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    videoTitle: text("video_title").notNull(),
    channelTitle: text("channel_title").notNull(),
    channelId: text("channel_id"),
    thumbnailUrl: text("thumbnail_url"),
    cuisine: text("cuisine"),
    mainIngredient: text("main_ingredient"),
    cookMinutes: integer("cook_minutes"),
    servings: text("servings"),
    ingredients: jsonb("ingredients")
      .$type<Ingredient[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    steps: jsonb("steps")
      .$type<Step[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    notes: text("notes"),
    confidence: text("confidence").notNull().default("medium"), // high | medium | low
    verified: boolean("verified").notNull().default(false),
    videoStatus: text("video_status").notNull().default("ok"), // ok | gone | off_playlist
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
    writtenAt: timestamp("written_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // FTS: lib/db/migrations/0001_search.sql → roux.recipes.search
  },
  (t) => [
    unique("recipes_user_video").on(t.userId, t.videoId),
    index("recipes_user_added_idx").on(t.userId, t.addedAt),
    index("recipes_user_uploaded_idx").on(t.userId, t.uploadedAt),
  ],
);

export const shareLinks = roux.table("share_links", {
  slug: text("slug").primaryKey(),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/**
 * Inter-user private grants (docs/plans/inter-user-sharing.md).
 * Separate from public share_links. Read-only for recipient; owner may revoke.
 * One active grant per (recipe, recipient) — enforced by partial unique index
 * in migration 0004 (revoked_at IS NULL).
 */
export const recipeGrants = roux.table(
  "recipe_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    // Must match migration 0004 — otherwise db:push can drop the partial unique.
    uniqueIndex("recipe_grants_active_unique")
      .on(t.recipeId, t.recipientUserId)
      .where(sql`${t.revokedAt} IS NULL`),
    index("recipe_grants_recipient_idx").on(t.recipientUserId),
    index("recipe_grants_owner_idx").on(t.ownerUserId),
    index("recipe_grants_recipe_idx").on(t.recipeId),
  ],
);

export const syncRuns = roux.table("sync_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  found: integer("found").notNull().default(0),
  written: integer("written").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  result: text("result"), // ok | no change | N no transcript | quota hit | error
  detail: jsonb("detail"),
});

/** Hard-delete tombstones so sync never re-adds a permanently removed video. */
export const recipeTombstones = roux.table(
  "recipe_tombstones",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: text("video_id").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.videoId] })],
);

/**
 * Videos that cannot be extracted yet (no captions / auth-blocked).
 * Sync skips these automatically until the row is removed.
 */
export const captionSkips = roux.table(
  "caption_skips",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: text("video_id").notNull(),
    title: text("title").notNull().default(""),
    /** no_captions | auth_blocked */
    kind: text("kind").notNull(),
    reason: text("reason"),
    playlistId: text("playlist_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.videoId] }),
    index("caption_skips_user_kind_idx").on(t.userId, t.kind),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type PlaylistRow = typeof playlists.$inferSelect;
export type RecipeRow = typeof recipes.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;
export type RecipeGrant = typeof recipeGrants.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
export type RecipeTombstone = typeof recipeTombstones.$inferSelect;
export type CaptionSkip = typeof captionSkips.$inferSelect;
