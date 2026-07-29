# Session State - Roux v1

**Date**: 2026-07-29

## Current Objective
Private YouTube cooking playlist → searchable recipe library on Vercel/Neon. M4 product loop shipped; next is **T9 polish** + optional bulk-sync cleanup.

## Next Concrete Step
Execute **T9** from `docs/plans/v1-implementation.md` (mobile pass, empty/error/quota UX, concurrency lock polish) — or continue local bulk sync of remaining playlist videos that still have captions.

## Key Context to Load
- **Prod:** https://roux-green.vercel.app · GH `huozhe/roux` · head `49d9ac7` (main clean)
- **Plan:** `docs/plans/v1-implementation.md` · **Spec:** `prototype/HANDOFF.md`
- **Sync:** local only — `npm run sync -- --max=N` (YouTube blocks Vercel captions). Optional `YOUTUBE_COOKIES` in `.env.local` (works; never put on Vercel).
- **Caption skips:** table `roux.caption_skips` (`no_captions` | `auth_blocked`); sync skips before fetch; Sync UI collapsible lists; `GET /api/sync/caption-skips` + backfill from run detail
- **Prefs:** `syncMarkVerified` → new extracts verified vs pending (`PrefsForm` + `lib/sync/run.ts`). Customs auto-learned from LLM cuisine/main.
- **DB now:** ~159 recipes (all verified last session), 54 no_captions + 3 auth_blocked skips. Prefs may not yet include `syncMarkVerified` key until user toggles Settings.
- **Extract:** Claude `claude-sonnet-4-6`, max_tokens 8k, retries, prose-JSON parse; `--max` counts writes/extract attempts only (not caption fails)

## Important Decisions & Invariants
- No YouTube browser cookies on Vercel (ban risk)
- Notes + verified never on public `/r/[slug]`
- Never re-extract `verified` recipes; caption_skips not re-fetched each run
- Playable + 0 caption tracks = **no_captions** (not LOGIN_REQUIRED)
- Session `user.id` = app UUID via `resolveAppUserId` / JWT `uid`
- Schema namespace: Postgres `roux` (not `public`)

## Open Risks / Things to Watch
- Many playlist videos truly have no CC/ASR — cannot extract without captions
- Cookie expiry → temporary `auth_blocked`; re-export Cookie header
- Vercel Hobby: daily cron only (purge kept; cloud sync 503 unless `SYNC_ALLOW_CLOUD`)
- Large sync cost/time: ~10–25s per successful extract, sequential

## Verification
```bash
git status -sb && git log -1 --oneline   # expect clean main @ 49d9ac7+
npm test && npx tsc --noEmit
npm run sync -- --max=1                  # local; needs .env.local
# Settings: New recipes from sync; Sync page expand caption skip lists
curl -sI https://roux-green.vercel.app | head -3
```
