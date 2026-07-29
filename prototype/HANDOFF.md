# Roux — v1 implementation handoff

A private web app that turns a YouTube playlist of cooking videos into a searchable
recipe library: ingredients, numbered steps, timestamps back into the video.

## What's in this package

| File | What it is |
| --- | --- |
| `Recipe App.dc.html` | The full interactive prototype — every screen, all states, real interactions. Open in a browser. **This is the spec for the UI.** |
| `Recipe App Mobile.dc.html` | The same app inside four Android frames (412×892): library, recipe, cook mode, settings. Mobile reference. |
| `_ds/organic-…/styles.css` | The design system: all tokens (color ramps, type, spacing, radii, shadows) and component classes (`.btn`, `.card`, `.tag`, `.input`, `.seg`, `.table`, `.dialog`). **Port this file as-is**; take every value from its variables. |
| `android-frame.jsx` | Prototype-only device frame. Not part of the product. |

The prototype is authored as a streaming component format with an inline-styled template plus a
logic class. Don't port that structure — re-implement in your framework and read the prototype as
the source of truth for layout, copy, states and interaction.

## Screens

1. **Login** — Google sign-in only for v1. Email/password is stubbed, visible, disabled — the flow
   drops in below the Google button when you open registration to other people.
2. **Library** — search (title, author, cuisine, main ingredient, ingredient text), cuisine chips,
   main-ingredient chips, sort (date added / date uploaded / cook time) with an
   ascending/descending toggle, `Library / Archive · N` view switch, optional "Newly added" shelf.
   Cards: thumbnail, cuisine + main tags, cleaned title, cook time, author, confidence flag, the
   date being sorted on, and a status tag when the video is gone or off-playlist.
3. **Recipe detail** — two layouts the user chooses in Settings: *single scroll* and
   *ingredients pinned*. Collapsed video row (expands to the player), ingredients, numbered steps
   with per-step video timestamps, personal notes, unverified banner, edit mode, share, remove.
4. **Cook mode** — one step at a time at 34px, progress dots, 64px bottom controls, keep-screen-awake
   (use the Screen Wake Lock API), timestamp link per step.
5. **Sync** — which playlists are watched, last/next run, manual "Sync now" with live stages,
   counters (added this month / missing transcript / unverified), history table.
6. **Settings** — account, reading preferences, multi-select source playlists, video-disappears
   policy (statement, not a choice), shared links with kill switch, library export, categories.
7. **Public shared page** — read-only, no nav, no notes, no verified/confidence flags, credits and
   links the original channel.

## Recommended stack

- **Next.js (App Router) on Vercel** — the prototype is a single-page app with server-side sync;
  Vercel's free tier covers it, and a custom domain drops in later with no code change.
- **Postgres** (Neon or Supabase) — the data is relational (recipes ↔ tags ↔ playlists ↔ users) and
  you want text search. Use Postgres full-text search (`tsvector`) for v1; don't add a search
  service. Prisma or Drizzle for the schema.
- **Auth.js (NextAuth) with the Google provider**, scope `https://www.googleapis.com/auth/youtube.readonly`.
  Store the refresh token — the cron job needs it to read the playlist while the user is away.
- **Vercel Cron** for syncing. The app decides the cadence (every 6h is right); it is not a user setting.
- **Claude** for the transcript → recipe extraction step.

## Data model

```sql
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  name          text,
  google_sub    text unique not null,
  refresh_token text,                        -- encrypted at rest
  prefs         jsonb not null default '{"layout":"single","timestamps":true,"newShelf":false}',
  created_at    timestamptz not null default now()
);

create table playlists (                     -- the playlists a user has selected
  id            text primary key,            -- YouTube playlist id
  user_id       uuid not null references users(id) on delete cascade,
  title         text not null,
  visibility    text not null,               -- private | unlisted | public
  item_count    int  not null default 0,
  selected      boolean not null default false,
  last_synced   timestamptz
);

create table recipes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  video_id      text not null,               -- YouTube video id
  playlist_id   text references playlists(id) on delete set null,
  title         text not null,               -- cleaned, not the clickbait video title
  video_title   text not null,               -- original, kept for search + attribution
  channel_title text not null,               -- "author"
  channel_id    text,
  thumbnail_url text,
  thumbnail_blob text,                       -- cache it: a deleted video loses its thumbnail
  cuisine       text,
  main_ingredient text,
  cook_minutes  int,
  servings      text,
  ingredients   jsonb not null default '[]',  -- [{qty, name, inferred: bool}]
  steps         jsonb not null default '[]',  -- [{n, text, t_seconds}]
  notes         text,                         -- private, never shared or exported publicly
  confidence    text not null default 'medium', -- high | medium | low
  verified      boolean not null default false, -- set by the user, or implicitly on save-after-edit
  video_status  text not null default 'ok',   -- ok | gone | off_playlist
  uploaded_at   timestamptz,
  added_at      timestamptz not null,         -- when it entered the playlist
  written_at    timestamptz not null default now(),
  archived_at   timestamptz,                  -- soft delete; 30-day hold
  deleted_at    timestamptz,                  -- tombstone: never re-add this video
  search        tsvector generated always as (
                  to_tsvector('english',
                    coalesce(title,'') || ' ' || coalesce(video_title,'') || ' ' ||
                    coalesce(channel_title,'') || ' ' || coalesce(cuisine,'') || ' ' ||
                    coalesce(main_ingredient,'') || ' ' || coalesce(ingredients::text,''))
                ) stored,
  unique (user_id, video_id)
);
create index on recipes using gin (search);
create index on recipes (user_id, added_at desc);
create index on recipes (user_id, uploaded_at desc);

create table share_links (
  slug          text primary key,            -- "mapo-tofu-a7f3"
  recipe_id     uuid not null references recipes(id) on delete cascade,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz                  -- killed links 404 forever; never reuse a slug
);

create table sync_runs (
  id            bigserial primary key,
  user_id       uuid not null references users(id) on delete cascade,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  found         int not null default 0,
  written       int not null default 0,
  skipped       int not null default 0,
  result        text,                        -- ok | no change | N no transcript | quota hit | error
  detail        jsonb
);
```

Categories: keep `cuisine` and `main_ingredient` as free text columns with a controlled list in
code (cuisines: Sichuan, Chinese, Japanese, Korean, Thai, Indian, Italian, French, Mexican,
American, …; mains: Beef, Pork, Chicken, Seafood, Tofu, Vegetable, Noodles). Users can add to the
list from Settings later; a join table is overkill until then.

## Sync

Cron every 6 hours per user, and on demand from the Sync page.

1. `playlistItems.list` for each selected playlist, paginated (50/page), newest first. Stop early
   when you hit a `video_id` you already have **and** the page is fully known — full crawl on first run.
2. For each new item: skip if a tombstone (`deleted_at`) or archive (`archived_at`) exists for that
   `video_id`. Otherwise insert a shell recipe row and enqueue extraction.
3. Extraction: fetch the transcript (captions). No transcript → count as `skipped`, leave the shell
   row out of the library and record it in `sync_runs.detail` so the Sync page can report
   "18 need a transcript". Retry on later runs (uploaders add captions late).
4. Ask Claude for structured JSON: `{title, cuisine, main_ingredient, cook_minutes, servings,
   ingredients:[{qty, name, inferred}], steps:[{text, t_seconds}], confidence}`. Require the
   timestamp per step (from the caption cue) — it's what makes the steps trustworthy. Mark any
   quantity the transcript didn't state as `inferred: true`; the UI renders those in brackets.
5. **Never overwrite a `verified` recipe.** Re-extraction only touches unverified rows.
6. Status reconciliation on every run:
   - video absent from every selected playlist but still public → `video_status = 'off_playlist'`
   - `videos.list` returns nothing for the id → `video_status = 'gone'`
   - Neither case ever deletes or hides the recipe. The write-up survives; only the link is disabled.
7. Purge job: hard-delete rows where `archived_at < now() - interval '30 days'` but keep a tombstone
   row (`deleted_at`) so sync won't resurrect them.
8. Quota: YouTube Data API is 10,000 units/day. `playlistItems.list` is 1 unit/page, `videos.list`
   is 1 unit/page — cheap. Batch 50 ids per `videos.list` call. On quota errors, write
   `result = 'quota hit'` and back off; the history table surfaces it.

## API routes

```
GET    /api/recipes?q=&cuisine[]=&main[]=&sort=added|uploaded|time&dir=asc|desc&view=library|archive
GET    /api/recipes/:id
PATCH  /api/recipes/:id          { title?, ingredients?, steps?, notes?, cuisine?, main_ingredient? }
                                 -- saving title/ingredients/steps sets verified = true
POST   /api/recipes/:id/verify
POST   /api/recipes/:id/archive
DELETE /api/recipes/:id          -- permanent, writes a tombstone
POST   /api/recipes/:id/restore
POST   /api/recipes/:id/share    -> { slug }        (idempotent per recipe)
DELETE /api/share/:slug          -- revoke; the public page 404s afterwards
GET    /api/playlists            -- from YouTube, merged with `selected`
PUT    /api/playlists            { selected: [id, …] }
POST   /api/sync                 -- manual run, streams stages (SSE) for the live status row
GET    /api/sync/history
PUT    /api/prefs                { layout, timestamps, newShelf }
GET    /api/export?format=json|markdown   -- includes notes; it's the user's own data
GET    /r/:slug                  -- public page, SSR, no auth, no notes, noindex
```

## Behaviour rules that matter

- **Notes and verified/confidence flags never appear on a shared page.** Export includes them.
- **Share links are killable** — revoke sets `revoked_at`; the slug is never reused.
- **Dead video links are never rendered.** When `video_status = 'gone'`: the watch button is
  disabled, the hero becomes a "Video no longer available" placeholder, step timestamps become
  plain text ("Was at 2:00 — video unavailable"), and the public page swaps the watch button for a
  credit notice. Cache thumbnails at sync time so the card keeps its picture.
- **Inferred quantities render in brackets** and drive the low/medium confidence banner.
- **Mobile is a first-class target**: the video is collapsed by default so ingredients are above the
  fold, cook-mode controls are 64px and bottom-anchored, hit targets ≥44px.
- **Attribution is mandatory** on the public page: channel name plus a link to the original video.

## Out of scope for v1 (designed for, not built)

Email/password registration, shopping lists, serving-size scaling, "cooked it" log, collection
share links, custom domain, per-playlist filtering in the library.
