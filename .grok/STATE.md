# Session State - caption skips + sync verified pref

**Date**: 2026-07-29

## Current Objective
Ship Roux v1. Caption skips + syncMarkVerified pref shipped.

## Next Concrete Step
T9 polish / manual E2E: Settings “Mark verified” → sync; Sync page expand caption skip lists.

## Key Context to Load
- Prod: https://roux-green.vercel.app
- `roux.caption_skips` table (no_captions / auth_blocked); GET `/api/sync/caption-skips`
- Pref `syncMarkVerified` controls new recipe verified flag on extract write
- Local sync + YOUTUBE_COOKIES; Head: `c6ae40a`

## Important Decisions & Invariants
- Verified recipes never re-extracted; caption_skips skipped before transcript fetch
- No cookies on Vercel

## Verification
```bash
npm test
# Settings → New recipes from sync → Mark verified
# Sync page → Expand no captions / auth blocked lists
```
