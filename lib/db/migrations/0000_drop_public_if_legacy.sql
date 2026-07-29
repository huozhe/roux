-- Optional: if you already ran db:push into public before the roux schema move,
-- drop those tables (data loss) so only roux.* remains.
-- Do NOT run this if you never created public tables.

DROP TABLE IF EXISTS public.recipe_tombstones CASCADE;
DROP TABLE IF EXISTS public.sync_runs CASCADE;
DROP TABLE IF EXISTS public.share_links CASCADE;
DROP TABLE IF EXISTS public.recipes CASCADE;
DROP TABLE IF EXISTS public.playlists CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
