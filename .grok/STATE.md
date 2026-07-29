# Session State - Roux playlist picker ship

**Date**: 2026-07-29

## Current Objective
Ship private YouTube cooking playlist → searchable recipe library (v1). Playlist picker UX shipped; next T9 polish + manual E2E.

## Next Concrete Step
Manual E2E Settings playlists (selected-only → Refresh → full list). Then T9 mobile/empty/error polish.

## Key Context to Load
- Plan: `docs/plans/v1-implementation.md` (M4 done; T9 open)
- Prod: https://roux-green.vercel.app
- Playlists: GET stored default; `?refresh=1` for YouTube; UI selected-only until refresh
- Categories: LLM labels auto-learned into prefs; library chips merge base+prefs+recipes
- Sync local-only (`npm run sync`)

## Important Decisions & Invariants
- No YouTube cookies on Vercel; session user.id = app UUID
- Notes/verified never on public share; never overwrite verified on re-extract

## Verification
```bash
npm test && npx tsc --noEmit
# Settings: only selected playlists; Refresh list shows full catalog
```
