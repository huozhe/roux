# Session State - Roux prefs fix ship

**Date**: 2026-07-29

## Current Objective
Ship private YouTube cooking playlist → searchable recipe library (v1). M4 + prefs UI wiring shipped; next is T9 polish + manual E2E.

## Next Concrete Step
Manual E2E on prod: Settings prefs (split / hide timestamps / new shelf) → recipe page reflects them; share/archive/export. Then T9 mobile/empty/error polish.

## Key Context to Load
- Plan: `docs/plans/v1-implementation.md` (M4 done; T9 open)
- Spec: `prototype/HANDOFF.md`
- Prod: https://roux-green.vercel.app · GH: huozhe/roux
- Head: prefs apply via `useLivePrefs` + `resolveAppUserId` (Google sub → UUID)
- Sync is **local-only** (`npm run sync`); extract Claude sonnet-4-6
- Prod data audit clean (1 user, 1 recipe, prefs already correct in DB) — `scripts/audit-prod-data.ts`

## Important Decisions & Invariants
- No YouTube browser cookies on Vercel
- Notes + verified never on public `/r/[slug]`
- Never overwrite `verified` recipes on re-extract
- Session `user.id` must be app UUID, not Google sub
- Schema: Postgres `roux` (not `public`)

## Open Risks / Things to Watch
- Transcript fetch fails from Vercel IPs → local sync
- Users with old JWTs: next request rehydrates `uid` via google_sub; hard refresh if prefs stale once

## Verification
```bash
npm test && npx tsc --noEmit
curl -sI https://roux-green.vercel.app | head -3
# Settings → Ingredients pinned / Hide timestamps / Show newly added → open recipe + library
```
