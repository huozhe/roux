# Session State - Roux v1

**Date**: 2026-07-29

## Current Objective
Private YouTube cooking playlist → searchable recipe library. Product loop + sync hygiene shipped; next **T9 polish**.

## Next Concrete Step
T9 from `docs/plans/v1-implementation.md` (mobile pass, empty/error/quota UX).

## Key Context to Load
- Prod: https://roux-green.vercel.app · head `e45548d`
- Local sync: `npm run sync -- --max=N` + optional `YOUTUBE_COOKIES` (not on Vercel)
- Caption skips: `no_captions` | `auth_blocked` | `unavailable` (kind only, sticky rank)
- Pref `syncMarkVerified`; empty runs skip YouTube `videos.list` status check
- Plan: `docs/plans/v1-implementation.md` · Spec: `prototype/HANDOFF.md`

## Important Decisions & Invariants
- No cookies on Vercel; verified never re-extracted
- Playable + 0 tracks = no_captions; unavailable auto-skipped
- Session user.id = app UUID via `resolveAppUserId`

## Verification
```bash
npm test && npx tsc --noEmit
npm run sync -- --max=1   # empty-ish run should not linger on video status
```
