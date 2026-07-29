# Session State - Roux M4 ship

**Date**: 2026-07-29

## Current Objective
Ship private YouTube cooking playlist → searchable recipe library (v1). M4 product loop wired; next is T9 polish + manual E2E.

## Next Concrete Step
Manual E2E on prod: login → select playlist → `npm run sync` local → edit/verify/notes → archive/restore → share → kill link → export. Then T9 mobile/empty/error polish.

## Key Context to Load
- Plan: `docs/plans/v1-implementation.md` (M4 mostly done; T9 open)
- Spec: `prototype/HANDOFF.md`
- Prod: https://roux-green.vercel.app · GH: huozhe/roux
- Live data when session + `DATABASE_URL`; fixtures only without auth/DB
- Sync is **local-only** (`npm run sync`); cloud POST `/api/sync` returns 503 unless `SYNC_ALLOW_CLOUD=true`
- Extract: Claude `claude-sonnet-4-6`; ingredient `group` from LLM

## Important Decisions & Invariants
- No YouTube browser cookies on Vercel (ban risk)
- Notes + verified never on public `/r/[slug]`
- Never overwrite `verified` recipes on re-extract
- Vercel Hobby: daily cron only (purge kept; cloud sync cron removed)
- Schema: Postgres `roux` (not `public`)

## Open Risks / Things to Watch
- Transcript fetch fails from Vercel IPs (LOGIN_REQUIRED) → local sync required
- Split layout / timestamps pref saved but not fully applied on recipe UI yet
- E2E not automated

## Verification
```bash
npm test && npx tsc --noEmit
git log -1 --oneline   # expect feat(m4) on main
curl -sI https://roux-green.vercel.app | head -5
```
