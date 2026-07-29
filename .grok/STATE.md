# Session State - Roux category learn ship

**Date**: 2026-07-29

## Current Objective
Ship private YouTube cooking playlist → searchable recipe library (v1). Category auto-learn shipped; next T9 polish + manual E2E.

## Next Concrete Step
Manual E2E: open Settings (backfill tags from recipes) → library chips; `npm run sync` new video → novel cuisine/main land in prefs. Then T9.

## Key Context to Load
- Plan: `docs/plans/v1-implementation.md` (M4 done; T9 open)
- Prod: https://roux-green.vercel.app
- LLM free-picks cuisine/main; `learnCategoriesFromLabels` saves novel ones to prefs
- Library chips: base + prefs + recipe labels; Settings backfill: `learnCategoriesFromUserRecipes`
- Sync local-only; extract Claude sonnet-4-6

## Important Decisions & Invariants
- Customs not sent into extract prompt — accumulate model output
- Session user.id = app UUID; notes/verified never on public share
- No YouTube cookies on Vercel

## Verification
```bash
npm test && npx tsc --noEmit
# Settings → categories include recipe tags; library chips match
```
