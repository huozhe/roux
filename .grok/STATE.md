# Session State - Roux sync harden ship

**Date**: 2026-07-29

## Current Objective
Ship private YouTube cooking playlist → searchable recipe library (v1). Sync/extract hardening shipped; bulk sync continues locally with YOUTUBE_COOKIES.

## Next Concrete Step
`npm run sync -- --max=50` (or higher) with cookies to clear remaining LOGIN_REQUIRED backlog. T9 polish when ready.

## Key Context to Load
- Prod: https://roux-green.vercel.app
- Local sync only; `YOUTUBE_COOKIES` in `.env.local` (works for captions)
- `--max` counts writes/extract attempts only, not caption fails
- All 143 recipes marked verified in DB (manual) so re-extract skipped
- Head: `01bd1f4` extract retries + max_tokens 8k + prose JSON parse

## Important Decisions & Invariants
- No cookies on Vercel; never overwrite verified on re-extract
- Session user.id = app UUID

## Verification
```bash
npm test && npx tsc --noEmit
npm run sync -- --max=1
```
