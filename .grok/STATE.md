# Session State - transcript classification ship

**Date**: 2026-07-29

## Current Objective
Ship Roux v1. Transcript fail kinds fixed (no_captions vs auth_blocked). All 159 recipes verified in DB.

## Next Concrete Step
Optional: re-run `npm run sync -- --max=20` to confirm skip breakdown labels; T9 polish when ready.

## Key Context to Load
- Prod: https://roux-green.vercel.app
- Local sync + YOUTUBE_COOKIES; most remaining backlog is true no_captions (OK + 0 tracks)
- Head: `bae2e80` transcript kind classification

## Important Decisions & Invariants
- No cookies on Vercel; verified recipes never re-extracted
- Playable + 0 tracks = no_captions, not LOGIN_REQUIRED

## Verification
```bash
npm test
npm run sync -- --max=5   # expect no_captions vs auth_blocked split
```
