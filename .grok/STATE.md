# Session State - Roux v1

**Date**: 2026-07-29

## Current Objective
Private YouTube cooking playlist → searchable recipe library. Categories add/remove shipped; next **T9 polish**.

## Next Concrete Step
T9 from `docs/plans/v1-implementation.md` (mobile, empty/error/quota UX).

## Key Context to Load
- Prod: https://roux-green.vercel.app · head `a1b52d3`
- Settings categories: add + remove; `hiddenCuisines`/`hiddenMains` for built-ins; library chips respect hide list
- Caption skips, `syncMarkVerified`, local `npm run sync` + optional `YOUTUBE_COOKIES`
- Plan: `docs/plans/v1-implementation.md` · Spec: `prototype/HANDOFF.md`

## Important Decisions & Invariants
- No cookies on Vercel; verified never re-extracted
- no_captions vs auth_blocked vs unavailable sticky ranks

## Verification
```bash
npm test
# Settings → Categories × remove / + Add restore
```
