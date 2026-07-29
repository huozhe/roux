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

- **M0** Bootstrap + Organic + login shell
- **M1** Shared types, fixtures, format/search helpers, fixture data adapter
- Next: parallel tracks T1 auth/db, T3 extract, T6–T8 UI
