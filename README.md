# Roux

Private web app: YouTube cooking playlists → searchable recipe library (ingredients, steps, timestamps).

## Spec

- Product / API / data: [`prototype/HANDOFF.md`](prototype/HANDOFF.md)
- UI prototype: `prototype/Recipe App.dc.html`
- Implementation plan: [`docs/plans/v1-implementation.md`](docs/plans/v1-implementation.md)

## Stack

Next.js (App Router) · Organic design system · Drizzle + Neon (coming) · Auth.js Google · Claude extract · Vercel Cron

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests (`lib/**/*.test.ts`) |

## Status

| Merge | Done |
| --- | --- |
| M0–M1 | Scaffold, Organic, login, types/fixtures/helpers |
| Wave 2 | T1 auth+Drizzle · T3 Claude extract · T6 library · T7 recipe/cook · T8 share/export/settings |
| T4 | YouTube playlists API + Settings picker (fixtures without OAuth) |
| Next | T5 sync/cron · wire fixtures → live API (M3–M4) |

### Try locally

```bash
npm run dev
```

Without Google env, auth gate is open so fixtures work:

- `/` library · `/recipes/r1` · `/recipes/r1/cook` · `/settings` · `/r/mapo-tofu-a7f3` · `/login`

### Auth + DB (when ready)

Copy `.env.example` → `.env.local`, set Google OAuth + Neon + `TOKEN_ENCRYPTION_KEY` (`openssl rand -hex 32`).

All tables live in the Postgres **schema** `roux` (not `public`):

```bash
npm run db:init-schema   # CREATE SCHEMA IF NOT EXISTS roux
npm run db:push          # tables → roux.users, roux.recipes, …
# Neon SQL editor: run lib/db/migrations/0001_search.sql (FTS on roux.recipes)
```

If you already pushed into `public` earlier, optionally run `lib/db/migrations/0000_drop_public_if_legacy.sql` then re-push into `roux`.
