# Session State - Roux v1

**Date**: 2026-07-29

## Current Objective
Ship private YouTube cooking playlist → searchable recipe library. Caption-skip hygiene shipped; next **T9 polish**.

## Next Concrete Step
T9 from `docs/plans/v1-implementation.md` (mobile, empty/error/quota UX) — or more local sync of remaining captioned videos.

## Key Context to Load
- Prod: https://roux-green.vercel.app · head `584a3b4`
- `roux.caption_skips`: kinds `no_captions` | `auth_blocked` | `unavailable` — kind+title only (no reason blob)
- Upsert never demotes kind; Sync page 3 collapsible lists; GET `/api/sync/caption-skips` no backfill
- Pref `syncMarkVerified`; local sync `npm run sync -- --max=N` + optional `YOUTUBE_COOKIES`
- ~159 recipes verified; skips reclassified ~55 / 2 / 1

## Important Decisions & Invariants
- No cookies on Vercel; verified never re-extracted
- Playable + 0 tracks = no_captions (not auth)
- Unavailable videos auto-skipped after first failure

## Verification
```bash
npm test && npx tsc --noEmit
# Sync page: No captions / Auth blocked / Unavailable expand lists
npm run sync -- --max=5   # should not recheck known skips
```
