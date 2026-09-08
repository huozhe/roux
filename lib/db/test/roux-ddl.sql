-- Minimal Roux schema for pglite integration tests (mirrors schema.ts + migrations).
CREATE SCHEMA IF NOT EXISTS roux;

CREATE TABLE IF NOT EXISTS roux.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  google_sub text NOT NULL UNIQUE,
  refresh_token text,
  prefs jsonb NOT NULL DEFAULT '{"layout":"single","timestamps":true,"newShelf":false,"syncMarkVerified":false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roux.playlists (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES roux.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  visibility text NOT NULL,
  item_count integer NOT NULL DEFAULT 0,
  selected boolean NOT NULL DEFAULT false,
  last_synced timestamptz
);

CREATE TABLE IF NOT EXISTS roux.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES roux.users (id) ON DELETE CASCADE,
  video_id text NOT NULL,
  playlist_id text REFERENCES roux.playlists (id) ON DELETE SET NULL,
  title text NOT NULL,
  video_title text NOT NULL,
  channel_title text NOT NULL,
  channel_id text,
  thumbnail_url text,
  cuisine text,
  main_ingredient text,
  cook_minutes integer,
  servings text,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  confidence text NOT NULL DEFAULT 'medium',
  verified boolean NOT NULL DEFAULT false,
  video_status text NOT NULL DEFAULT 'ok',
  uploaded_at timestamptz,
  added_at timestamptz NOT NULL,
  written_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  UNIQUE (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS recipes_user_added_idx ON roux.recipes (user_id, added_at);
CREATE INDEX IF NOT EXISTS recipes_user_uploaded_idx ON roux.recipes (user_id, uploaded_at);

-- 0001_search.sql — spike: confirm generated tsvector works on pglite
ALTER TABLE roux.recipes
  ADD COLUMN IF NOT EXISTS search tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' ||
      coalesce(video_title, '') || ' ' ||
      coalesce(channel_title, '') || ' ' ||
      coalesce(cuisine, '') || ' ' ||
      coalesce(main_ingredient, '') || ' ' ||
      coalesce(ingredients::text, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS recipes_search_gin ON roux.recipes USING gin (search);

CREATE TABLE IF NOT EXISTS roux.share_links (
  slug text PRIMARY KEY,
  recipe_id uuid NOT NULL REFERENCES roux.recipes (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- Inter-user grants (docs/plans/inter-user-sharing.md)
CREATE TABLE IF NOT EXISTS roux.recipe_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES roux.recipes (id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES roux.users (id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES roux.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS recipe_grants_active_unique
  ON roux.recipe_grants (recipe_id, recipient_user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS recipe_grants_recipient_idx
  ON roux.recipe_grants (recipient_user_id);

CREATE INDEX IF NOT EXISTS recipe_grants_owner_idx
  ON roux.recipe_grants (owner_user_id);

CREATE INDEX IF NOT EXISTS recipe_grants_recipe_idx
  ON roux.recipe_grants (recipe_id);

CREATE TABLE IF NOT EXISTS roux.sync_runs (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES roux.users (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  found integer NOT NULL DEFAULT 0,
  written integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  result text,
  detail jsonb
);

CREATE TABLE IF NOT EXISTS roux.recipe_tombstones (
  user_id uuid NOT NULL REFERENCES roux.users (id) ON DELETE CASCADE,
  video_id text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

CREATE TABLE IF NOT EXISTS roux.caption_skips (
  user_id uuid NOT NULL REFERENCES roux.users (id) ON DELETE CASCADE,
  video_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  kind text NOT NULL,
  reason text,
  playlist_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS caption_skips_user_kind_idx
  ON roux.caption_skips (user_id, kind);
-- Whole-library guest access (docs/plans/shared-library-mode.md).
-- One row per invited guest; the 128-bit token is the only credential.

CREATE TABLE IF NOT EXISTS roux.library_shares (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES roux.users (id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS library_shares_user_idx
  ON roux.library_shares (user_id);
