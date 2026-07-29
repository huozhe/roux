# Session State - Roux custom chips ship

**Date**: 2026-07-29

## Current Objective
Ship private YouTube cooking playlist → searchable recipe library (v1). M4 + prefs + custom category chips shipped; next T9 polish + manual E2E.

## Next Concrete Step
Manual E2E: Settings categories → library filter chips show customs; prefs layout/timestamps/shelf. Then T9 mobile/empty/error polish.

## Key Context to Load
- Plan: `docs/plans/v1-implementation.md` (M4 done; T9 open)
- Spec: `prototype/HANDOFF.md`
- Prod: https://roux-green.vercel.app · GH: huozhe/roux
- Prefs: `useLivePrefs` + `resolveAppUserId`; chips via `categoryOptions(CUISINES|MAINS, custom*)`
- Sync local-only (`npm run sync`); extract Claude sonnet-4-6
- Audit: `scripts/audit-prod-data.ts`

## Important Decisions & Invariants
- No YouTube cookies on Vercel; notes/verified never on public share
- Never overwrite verified recipes on re-extract
- Session user.id = app UUID (not Google sub)
- Schema: Postgres `roux`

## Open Risks / Things to Watch
- Transcript fetch fails from Vercel IPs → local sync
- Custom category only filters if recipes use matching cuisine/main strings

## Verification
```bash
npm test && npx tsc --noEmit
# Settings add cuisine → Library filter row includes it
```
