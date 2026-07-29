-- Generated full-text search column + GIN index (run after drizzle push/migrate).
-- Drizzle schema documents this; apply manually or via drizzle-kit custom migration.

ALTER TABLE recipes
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

CREATE INDEX IF NOT EXISTS recipes_search_gin ON recipes USING gin (search);
