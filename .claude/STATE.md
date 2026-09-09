# Claude Session State — Roux

**Role:** external reviewer by default — Grok implements, Claude reviews. Protocol: §10 of `docs/reviews/2026-07-31-external-code-review.md`. The owner can override per task (they did for shared library mode); ask if it's ambiguous.

## Current status

July external code review fully discharged; issue #3 closed. Round 2 (multi-user) complete.

**The repo is public** (MIT) as of 2026-09-09, head `d715dbb`. Going public added a per-IP throttle on the unauthenticated `/r/*` and `/s/*` routes (`lib/guest-rate-limit.ts`), README screenshots, and removed the stale `docs/reviews/.pr-body.md` ledger, whose statuses had frozen at `OPEN` and read as live vulnerabilities.

**Shared library mode is shipped** — deployed 2026-09-08, migration `0005_library_shares.sql` applied to Neon and verified. Guests open `/s/<token>` and read the owner's whole library with no account: search, filters, sort and cook mode; no export. Design and known limits: `docs/plans/shared-library-mode.md`. Claude implemented this one at the owner's direction, so it has had **no independent review**.

The **local ASR design** (`docs/plans/local-asr-whisper.md`) is **ACCEPTED** but nothing is implemented.

## Next up

Implement local ASR from **§7 step 2** of `docs/plans/local-asr-whisper.md` (`lib/asr/` pure module + unit tests, no binaries). Two items that are easy to lose:

- The candidate-loop gate at `lib/sync/run.ts:249` drops the `no_captions` backlog before ASR sees it — §4.7 has the fix and the `listCaptionSkipVideoIds` → kinds signature change.
- `getVideosMeta` requests `part=snippet,status`; the 45-min cap needs `contentDetails` or it's dead code.

## Resume

```bash
git rev-list -1 main            # expect d715dbb
npm test                        # 167 pass
gh pr list                      # expect empty
```

## Known issues

- **`rtk` proxy mangles git output here.** `git log --oneline` has printed wrong SHAs and `wc -l` returned 0 for a non-empty file. Use `git cat-file` / `git rev-list` / `node -e` when history or counts matter.
- **Vercel stopped writing GitHub deployment records** (last one 2026-08-01). `gh api .../deployments` looks stale and is not evidence of a missing deploy — read `gh api repos/huozhe/roux/commits/<sha>/statuses` instead. Prod is now publicly reachable, so `curl` is also evidence: `/s/<token>` returns 200, `/` returns 307 to `/login`.
- **`main` is protected server-side** — requires the `Test & build` check, blocks force-push and deletion, and `enforce_admins` is on, so **nobody pushes directly to `main`, including the owner**. Required approvals are **zero** by design: both agents push as GitHub user `huozhe`, so GitHub blocks Approve / Request-changes on their own PRs and verdicts land as Comment reviews. Conversation resolution is required before merge.
- **Vercel holds only the 8 vars the app reads**, all Production-scoped bar a Development `AUTH_URL`; nothing is scoped to Preview, so fork preview builds carry no secrets. The Neon integration's `POSTGRES_*` / `PG*` / `NEON_*` vars were deleted as unused — **the integration may re-add them**, so re-check after any Neon dashboard change. `DATABASE_URL` must be the **pooled** Neon string (host contains `-pooler`). Git Fork Protection is on.
- **`vercel env rm <NAME> preview` deletes the variable from every environment**, not just Preview — the positional argument only disambiguates same-named entries. It removed `DATABASE_URL` from Production once. Use the dashboard entry editor to change scope.

## Reviewer calibration

Contrast ratios, token counts and index/DDL equivalence are computable locally — try before claiming something needs a browser or a DB. Read the file; grep-and-infer on multi-line JSX produced several wrong findings. Conceding when the implementer is right is a success (§10.5 rule 4).
