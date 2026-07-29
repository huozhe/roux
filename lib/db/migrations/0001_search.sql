-- Generated full-text search column + GIN index on roux.recipes.
-- Run after drizzle push/migrate (schema must exist).

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
